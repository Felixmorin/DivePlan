import pg from "pg";

const connectionString = process.env.DIVEPLAN_AUDIT_DATABASE_URL;
if (!connectionString) {
  process.stderr.write("Audit DB non configurée.\n");
  process.exit(2);
}

const client = new pg.Client({
  connectionString,
  application_name: "diveplan-readonly-sql-audit",
  connectionTimeoutMillis: 8000,
  query_timeout: 15000,
  statement_timeout: 15000
});

const queries = {
  overview: `
    SELECT current_setting('server_version') AS postgres_version,
           stats.stats_reset,
           audit_role.rolsuper AS role_is_superuser,
           audit_role.rolcreatedb AS role_can_create_database,
           audit_role.rolcreaterole AS role_can_create_roles,
           audit_role.rolreplication AS role_can_replicate,
           audit_role.rolbypassrls AS role_bypasses_rls
    FROM pg_stat_database AS stats
    JOIN pg_roles AS audit_role ON audit_role.rolname = current_user
    WHERE stats.datname = current_database()
    LIMIT 1`,
  foreignKeysWithoutIndex: `
    SELECT ns.nspname AS schema_name, tbl.relname AS table_name,
           con.conname AS constraint_name,
           array_agg(att.attname ORDER BY fk.ordinality) AS columns,
           refns.nspname AS referenced_schema, ref.relname AS referenced_table
    FROM pg_constraint AS con
    JOIN pg_class AS tbl ON tbl.oid = con.conrelid
    JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
    JOIN pg_class AS ref ON ref.oid = con.confrelid
    JOIN pg_namespace AS refns ON refns.oid = ref.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS fk(attnum, ordinality) ON true
    JOIN pg_attribute AS att ON att.attrelid = tbl.oid AND att.attnum = fk.attnum
    WHERE con.contype = 'f' AND ns.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index AS idx
        JOIN pg_class AS index_rel ON index_rel.oid = idx.indexrelid
        JOIN pg_am AS index_am ON index_am.oid = index_rel.relam AND index_am.amname = 'btree'
        WHERE idx.indrelid = con.conrelid AND idx.indisvalid AND idx.indisready
          AND idx.indpred IS NULL AND idx.indnkeyatts >= cardinality(con.conkey)
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(con.conkey) WITH ORDINALITY AS fk_col(attnum, ordinality)
            JOIN unnest(idx.indkey::smallint[]) WITH ORDINALITY AS idx_col(attnum, ordinality)
              USING (ordinality)
            WHERE fk_col.attnum <> idx_col.attnum
          )
      )
    GROUP BY ns.nspname, tbl.relname, con.conname, refns.nspname, ref.relname
    ORDER BY ns.nspname, tbl.relname, con.conname
    LIMIT 500`,
  unusedIndexes: `
    SELECT schemaname AS schema_name, relname AS table_name,
           indexrelname AS index_name, idx_scan,
           pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
           indisprimary AS is_primary, indisunique AS is_unique
    FROM pg_stat_user_indexes AS stats
    JOIN pg_index AS idx ON idx.indexrelid = stats.indexrelid
    WHERE schemaname = 'public' AND idx_scan = 0
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 500`,
  rlsTablesWithoutPolicy: `
    SELECT ns.nspname AS schema_name, tbl.relname AS table_name,
           tbl.relforcerowsecurity AS force_rls
    FROM pg_class AS tbl
    JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public' AND tbl.relkind IN ('r', 'p') AND tbl.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy AS pol WHERE pol.polrelid = tbl.oid)
    ORDER BY tbl.relname
    LIMIT 500`,
  policies: `
    SELECT ns.nspname AS schema_name, tbl.relname AS table_name,
           pol.polname AS policy_name, pol.polcmd AS command,
           ARRAY(SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END
                 FROM unnest(pol.polroles) AS role_oid) AS roles
    FROM pg_policy AS pol
    JOIN pg_class AS tbl ON tbl.oid = pol.polrelid
    JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public'
    ORDER BY tbl.relname, pol.polname
    LIMIT 1000`,
  functionAudit: `
    SELECT p.oid::regprocedure::text AS function_identity,
           pg_get_userbyid(p.proowner) AS owner,
           p.prosecdef AS security_definer,
           p.proconfig AS function_settings,
           pg_get_functiondef(p.oid) AS definition,
           ARRAY(SELECT role_name
                 FROM unnest(ARRAY['anon','authenticated','service_role']) AS role_name
                 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
                   AND has_function_privilege(role_name, p.oid, 'EXECUTE')) AS executable_roles,
           ARRAY(SELECT DISTINCT CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
                                      ELSE pg_get_userbyid(acl.grantee) END
                 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
                 WHERE acl.privilege_type = 'EXECUTE'
                   AND (acl.grantee = 0 OR acl.grantee IN
                     (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')))) AS execute_acl,
           ARRAY(SELECT evt.evtname
                 FROM pg_event_trigger AS evt
                 WHERE evt.evtfoid = p.oid ORDER BY evt.evtname) AS event_triggers
    FROM pg_proc AS p
    JOIN pg_namespace AS ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'rls_auto_enable'
    LIMIT 10`
};

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '12s'");
  const result = {};
  for (const [name, sql] of Object.entries(queries)) {
    const savepoint = `audit_${name}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
      result[name] = (await client.query(sql)).rows;
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      result[name] = { unavailable: true };
    }
  }
  const role = Array.isArray(result.overview) ? result.overview[0] : null;
  if (!role || role.role_is_superuser || role.role_can_create_database || role.role_can_create_roles || role.role_can_replicate || role.role_bypasses_rls) {
    throw new Error("Audit role does not meet least-privilege requirements.");
  }
  await client.query("ROLLBACK");
  process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), ...result }));
} catch {
  process.stderr.write("Échec de l’audit PostgreSQL en lecture seule; détails de connexion masqués.\n");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
