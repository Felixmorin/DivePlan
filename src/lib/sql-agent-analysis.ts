import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export type SqlFinding = {
  kind: "observed" | "code" | "hypothesis";
  priority: "high" | "medium" | "low";
  impact: string;
  effort: "faible" | "moyen" | "élevé";
  title: string;
  location: string;
  evidence: string;
  limits: string;
  recommendation: string;
};

export type SourceFile = { path: string; content: string };
const MAX_FILES = 1200;
const MAX_FILE_BYTES = 1_000_000;
const SOURCE_ROOTS = ["src/app", "src/lib", "src/components", "prisma/migrations", "db/migrations"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".sql"]);
const AGENT_INFRASTRUCTURE_FILES = new Set([
  "src/lib/agent-worker.ts",
  "src/lib/pr-agent-consolidation.ts",
  "src/lib/sql-agent-analysis.ts"
]);

async function collectFiles(root: string, directory: string, files: string[]) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await collectFiles(root, path, files);
    else if (SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) files.push(path);
    if (files.length >= MAX_FILES) return;
  }
}

export async function loadDivePlanSources(root = process.cwd()) {
  const paths: string[] = [];
  const missing: string[] = [];
  for (const directory of SOURCE_ROOTS) {
    try { await collectFiles(root, directory, paths); }
    catch { missing.push(directory); }
  }
  for (const path of ["src/auth.ts", "prisma/schema.prisma", "package.json", "vercel.json", "next.config.ts", "README.md", "docs/ai-agents.md"]) {
    try { await readFile(join(root, path)); paths.push(path); }
    catch { if (path !== "prisma/schema.prisma") missing.push(path); }
  }
  const files: SourceFile[] = [];
  for (const path of paths.slice(0, MAX_FILES)) {
    try {
      const content = await readFile(join(root, path), "utf8");
      if (Buffer.byteLength(content) <= MAX_FILE_BYTES) files.push({ path: relative(root, join(root, path)).replaceAll("\\", "/"), content });
    } catch { /* Missing or oversized sources are reported through the source counts/limits. */ }
  }
  return { files, unavailableRoots: missing, truncated: paths.length >= MAX_FILES };
}

function extractQueries(content: string) {
  const calls: Array<{ sql: string; line: number; index: number }> = [];
  const matcher = /\bquery\s*(?:<[^>]*>)?\s*\(\s*([`'"])([\s\S]*?)\1/g;
  for (const match of content.matchAll(matcher)) {
    const index = match.index ?? 0;
    const line = content.slice(0, index).split("\n").length;
    calls.push({ sql: match[2], line, index });
  }
  return calls;
}

function matchingBrace(content: string, openIndex: number) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return index;
  }
  return -1;
}

function isCallInsideLoop(content: string, callIndex: number) {
  const scopes = [/\b(?:for|while)\s*\([^)]*\)\s*\{/g, /\.map\s*\([^=]*=>\s*\{/g];
  for (const matcher of scopes) for (const match of content.matchAll(matcher)) {
    const start = match.index ?? 0;
    if (start >= callIndex) continue;
    const open = (match.index ?? 0) + match[0].lastIndexOf("{");
    const close = matchingBrace(content, open);
    if (open < callIndex && close > callIndex) return true;
  }
  return false;
}

export function analyzeSqlSourceFiles(files: SourceFile[], options: { unavailableRoots?: string[]; truncated?: boolean } = {}) {
  const findings: SqlFinding[] = [];
  let queryCount = 0;
  const normalizedQueries = new Map<string, string[]>();
  const schemaFile = files.find((file) => file.path.endsWith("schema.prisma"));
  const indexFields = readSchemaIndexFields(schemaFile?.content ?? "");
  for (const file of files) {
    if (file.path.startsWith("src/app/admin/agents/") || AGENT_INFRASTRUCTURE_FILES.has(file.path)) continue;
    if (file.path.endsWith("schema.prisma") || /\.(?:test|spec)\.tsx?$/.test(file.path)) continue;
    for (const call of extractQueries(file.content)) {
      const sql = call.sql.replace(/\s+/g, " ").trim();
      if (!/\b(select|insert|update|delete)\b/i.test(sql)) continue;
      queryCount += 1;
      const location = `${file.path}:${call.line}`;
      const normalized = sql.toLowerCase().replace(/\$\d+/g, "?").replace(/\s+/g, " ");
      normalizedQueries.set(normalized, [...(normalizedQueries.get(normalized) ?? []), location]);
      if (/\bselect\s+\*/i.test(sql) && !/\bunnest\s*\(/i.test(sql)) {
        findings.push({ kind: "code", priority: "medium", impact: "Peut transférer des colonnes inutilisées et augmenter le volume de résultat.", effort: "faible", title: "SELECT * dans une requête", location, evidence: "Motif SELECT * repéré dans l’instruction SQL à cette ligne.", limits: "L’analyse statique ne connaît pas les colonnes effectivement consommées par le code appelant.", recommendation: "Sélectionner explicitement les colonnes utilisées et vérifier l’impact avant de modifier la requête." });
      }
      if (/\bselect\b/i.test(sql) && !/\b(limit|fetch\s+first|offset)\b/i.test(sql) && !/\b(count|sum|avg|min|max)\s*\(/i.test(sql)) {
        findings.push({ kind: "code", priority: "medium", impact: "Le nombre de lignes lues peut croître avec les données.", effort: "moyen", title: "Lecture sans pagination visible", location, evidence: "Instruction SELECT sans LIMIT, FETCH ou OFFSET visible.", limits: "Un filtre peut limiter les résultats en pratique; aucune mesure de cardinalité n’est disponible ici.", recommendation: "Vérifier la cardinalité réelle et ajouter une pagination ou une limite métier si l’ensemble peut grandir." });
      }
      if (/\breturning\s+\*/i.test(sql)) {
        findings.push({ kind: "code", priority: "low", impact: "Le retour après écriture peut transférer des colonnes inutiles.", effort: "faible", title: "Écriture avec RETURNING *", location, evidence: "Motif RETURNING * repéré dans l’instruction SQL à cette ligne.", limits: "Le volume dépend du schéma et du nombre de lignes modifiées.", recommendation: "Retourner seulement les identifiants ou champs consommés par l’appelant." });
      }
      const table = sql.match(/\bfrom\s+"?([A-Za-z_][\w]*)"?/i)?.[1];
      const whereClause = sql.split(/\bwhere\b/i)[1]?.split(/\b(order\s+by|group\s+by|limit|returning)\b/i)[0] ?? "";
      const filteredColumns = Array.from(whereClause.matchAll(/(?:"?[A-Za-z_]\w*"?\.)?"?([A-Za-z_]\w*)"?\s*(?:=|<>|!=|>=|<=|>|<|\bIN\b|\bIS\b)/gi), (match) => match[1]);
      const unindexed = schemaFile && table && indexFields.has(table) ? [...new Set(filteredColumns)].filter((column) => !indexFields.get(table)?.has(column)) : [];
      for (const column of unindexed.slice(0, 2)) {
        findings.push({ kind: "hypothesis", priority: "low", impact: `Le filtre sur ${table}.${column} peut nécessiter une lecture plus large si la table est volumineuse.`, effort: "moyen", title: `Piste d’index à vérifier · ${table}.${column}`, location, evidence: `Filtre SQL détecté sur ${table}.${column}; aucun index de modèle correspondant n’apparaît dans le schéma Prisma fourni.`, limits: "La base peut avoir un index créé hors Prisma; le plan de requête, les cardinalités et la sélectivité ne sont pas consultés.", recommendation: "Vérifier les index réels et EXPLAIN (ANALYZE, BUFFERS); ne créer un index qu’après validation de la charge et du coût d’écriture." });
      }
      if (isCallInsideLoop(file.content, call.index)) {
        findings.push({ kind: "code", priority: "high", impact: "Une requête répétée dans une boucle peut multiplier les allers-retours (N+1).", effort: "moyen", title: "Accès SQL potentiellement répété dans une boucle", location, evidence: "Un appel SQL est précédé d’une boucle dans le même contexte source.", limits: "La proximité textuelle est une heuristique; elle ne prouve pas que l’appel est exécuté à chaque itération.", recommendation: "Vérifier le chemin d’exécution et envisager une jointure, une requête groupée ou un chargement par lots." });
      }
    }
  }
  for (const [sql, locations] of normalizedQueries) {
    if (locations.length < 2 || !/\b(select|insert|update|delete)\b/.test(sql)) continue;
    findings.push({ kind: "code", priority: "medium", impact: "Des instructions identiques présentes à plusieurs endroits peuvent répéter le même accès selon le chemin utilisateur.", effort: "faible", title: "Instruction SQL dupliquée dans le code", location: locations.slice(0, 6).join(" · "), evidence: `${locations.length} occurrences normalisées de la même instruction SQL.`, limits: "La duplication du texte ne prouve pas que les appels s’exécutent ensemble ni qu’ils provoquent des requêtes répétées à l’exécution.", recommendation: "Vérifier si les appels sont redondants; mutualiser ou regrouper le chargement uniquement si les traces le confirment." });
  }

  const sessionFiles = files.filter((file) => file.path.includes("src/app/coach/sessions/") || file.path.includes("src/lib/coach-session"));
  const sessionQueries = sessionFiles.flatMap((file) => extractQueries(file.content).map((call) => ({ file, call })));
  if (sessionQueries.length) {
    const loopCandidates = sessionFiles.flatMap((file) => extractQueries(file.content).filter((call) => isCallInsideLoop(file.content, call.index)).map((call) => `${file.path}:${call.line}`));
    const loopEvidence = loopCandidates.length ? `; appels proches d’une boucle repérés à ${loopCandidates.slice(0, 4).join(", ")}` : "";
    findings.push({ kind: "hypothesis", priority: loopCandidates.length ? "high" : "medium", impact: "Le détail de séance assemble plusieurs données; le coût total dépend du volume de relations et des accès exécutés par branche.", effort: "moyen", title: "Vérifier le coût SQL du détail de séance", location: "src/app/coach/sessions/[id]/page.tsx · src/lib/coach-session.ts", evidence: `${sessionQueries.length} appels SQL extraits des fichiers de séances${loopEvidence}.`, limits: "Le nombre effectif d’appels, les octets et la durée ne sont pas mesurés par cette analyse du code.", recommendation: "Comparer les appels et volumes en production; regrouper les chargements répétitifs si les traces confirment un N+1." });
  }
  findings.push({ kind: "hypothesis", priority: "low", impact: "Un index adapté peut réduire les lectures pour les filtres et tris fréquents.", effort: "moyen", title: "Valider les index avec les plans de requête", location: "prisma/schema.prisma · migrations SQL", evidence: "Le dépôt contient le schéma Prisma et les migrations; aucun plan EXPLAIN ni statistique exploitable de requêtes n’est fourni à l’agent.", limits: "Aucun index manquant ou inutile ne peut être confirmé sans plans, cardinalités et charge représentative.", recommendation: "Examiner EXPLAIN (ANALYZE, BUFFERS) sous contrôle humain et comparer les index aux filtres réellement observés avant toute migration." });
  findings.push({ kind: "hypothesis", priority: "low", impact: "Un index inutilisé peut ajouter du coût aux écritures et consommer de l’espace disque.", effort: "moyen", title: "Usage réel des index non observé", location: "Statistiques PostgreSQL · pg_stat_user_indexes", evidence: "Aucune statistique d’utilisation d’index n’est accessible à l’agent dans la configuration actuelle.", limits: "Un index sans lecture observée sur une courte fenêtre peut rester utile pour des charges rares ou après redémarrage des compteurs.", recommendation: "Comparer idx_scan et les lectures sur une période représentative avec un accès de statistiques en lecture seule avant de proposer sa suppression." });
  findings.push({ kind: "hypothesis", priority: "low", impact: "Les paramètres de pool et les politiques RLS peuvent affecter latence, connexions et isolation.", effort: "moyen", title: "Vérifier pooler et politiques RLS dans l’environnement", location: "src/lib/db.ts · configuration Supabase", evidence: "Le pool applicatif limite chaque instance à trois connexions; aucune politique RLS ni API de gestion Supabase n’est consultée par l’agent.", limits: "La configuration effective, le pooler distant et les politiques de production ne sont pas lisibles dans le dépôt.", recommendation: "Comparer la chaîne de connexion au pooler recommandé et auditer les politiques RLS depuis un rôle autorisé en lecture seule." });
  if (queryCount === 0) findings.push({ kind: "hypothesis", priority: "low", impact: "Le scan SQL n’a pas pu examiner d’appels SQL.", effort: "faible", title: "Aucun appel SQL détecté", location: "src/app · src/lib · migrations", evidence: "Aucun appel `query(...)` contenant une instruction SQL n’a été extrait.", limits: "Les requêtes construites dynamiquement ou encapsulées dans d’autres abstractions peuvent échapper au scan.", recommendation: "Vérifier les sources déployées et les abstractions de base de données utilisées." });
  const assumptions = [
    "Les constats de code sont issus de motifs textuels et ne représentent pas des plans d’exécution ni des mesures de durée.",
    "Aucune intégration à l’API de statistiques Supabase, à pg_stat_statements ou aux politiques RLS n’est configurée; le rapport ne présente pas ces données comme observées.",
    "La connexion de l’application est utilisée seulement dans une transaction PostgreSQL READ ONLY pour lire les agrégats de télémétrie; la file et le rapport sont écrits séparément par le worker."
  ];
  const missing = [
    "Statistiques Supabase / pg_stat_statements: configuration requise (accès SQL en lecture seule et extension/permissions disponibles).",
    "L’agent ne peut ni modifier la base, ni appliquer des migrations, ni fusionner une PR ou déployer."
  ];
  if (options.unavailableRoots?.length) missing.push(`Sources non disponibles dans l’environnement du worker: ${options.unavailableRoots.join(", ")}.`);
  if (options.truncated) missing.push("Le nombre maximal de fichiers du scan a été atteint; l’inventaire peut être incomplet.");
  return { queryCount, findings, assumptions, missing };
}

function readSchemaIndexFields(schema: string) {
  const indexFields = new Map<string, Set<string>>();
  for (const model of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const fields = new Set<string>();
    for (const line of model[2].split("\n")) {
      const field = line.match(/^\s*(\w+)\s+[^\s]+.*@(id|unique)\b/);
      if (field) fields.add(field[1]);
    }
    for (const index of model[2].matchAll(/@@(?:id|unique|index)\s*\(\s*\[([^\]]+)\]/g)) {
      for (const field of index[1].matchAll(/\b(\w+)\b/g)) fields.add(field[1]);
    }
    indexFields.set(model[1], fields);
  }
  return indexFields;
}

export async function analyzeDivePlanSqlCode(root = process.cwd()) {
  const loaded = await loadDivePlanSources(root);
  const analysis = analyzeSqlSourceFiles(loaded.files, loaded);
  return { ...analysis, fileCount: loaded.files.length };
}
