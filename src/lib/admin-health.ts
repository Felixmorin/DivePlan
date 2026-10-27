import "server-only";
import { cache } from "react";
import { query } from "@/lib/db";
import { completeAdminHealthRun, getLatestAdminHealthRuns, type HealthRun } from "@/lib/admin-health-runs";

export type HealthState = "ok" | "warning" | "failed" | "unknown" | "not_configured" | "disabled";
export type HealthCheck = { id: string; name: string; state: HealthState; detail: string; checkedAt: string };
export type AdminHealth = { state: "action_required" | "degraded" | "incomplete" | "checked"; label: string; tone: "warning" | "neutral" | "unavailable"; checks: HealthCheck[]; checkedAt: string };

const globalForAdminHealth = globalThis as typeof globalThis & { divePlanAdminHealth?: { expiresAt: number; value: Promise<AdminHealth> } };
export const getAdminHealth = cache(async (): Promise<AdminHealth> => {
  const cached = globalForAdminHealth.divePlanAdminHealth;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = buildAdminHealth();
  globalForAdminHealth.divePlanAdminHealth = { expiresAt: Date.now() + 15_000, value };
  return value;
});

async function buildAdminHealth(): Promise<AdminHealth> {
  const checkedAt = new Date().toISOString();
  const checks: HealthCheck[] = [];
  const add = (id: string, name: string, state: HealthState, detail: string, at = checkedAt) => checks.push({ id, name, state, detail, checkedAt: at });
  add("application", "Application", "ok", "La requête admin s’est rendue et les contrôles serveur ont démarré.");

  try {
    await query("SELECT 1 AS ok");
    await query('SELECT id FROM "User" LIMIT 1');
    add("database", "Base de données et comptes", "ok", "PostgreSQL répond et la table des comptes est accessible.");
  } catch {
    add("database", "Base de données et comptes", "failed", "La sonde PostgreSQL ou la table des comptes a échoué.");
  }

  try {
    const result = await query<{ errors: string }>(`SELECT count(*)::text AS errors FROM "AppEvent" WHERE "createdAt" >= NOW() - INTERVAL '24 hours' AND (type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure')`);
    const count = Number(result.rows[0]?.errors ?? 0);
    add("events", "Journal AppEvent", count > 0 ? "warning" : "ok", count > 0
      ? `${count.toLocaleString("fr-CA")} erreur(s) consignée(s) sur 24 h; ce journal ne couvre pas toutes les erreurs serveur.`
      : "La lecture du journal fonctionne; aucune erreur correspondante n’y est consignée sur 24 h. Ce contrôle ne couvre pas les erreurs absentes du journal.");
  } catch {
    add("events", "Journal AppEvent", "failed", "Le journal AppEvent ne peut pas être lu.");
  }

  const authSecretReady = process.env.NODE_ENV !== "production" || Boolean(process.env.AUTH_SECRET);
  add("auth-config", "Configuration Auth.js", authSecretReady ? "ok" : "failed", authSecretReady
    ? process.env.NODE_ENV === "production" ? "La clé de session de production est présente." : "Auth.js utilise la configuration locale; cette sonde ne valide pas la clé de production."
    : "AUTH_SECRET est absent en production.");

  const storageUrl = process.env.SUPABASE_URL;
  const storageKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!storageUrl && !storageKey) {
    add("storage", "Supabase Storage · avatars", "not_configured", "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis pour les avatars Supabase.");
  } else if (!storageUrl || !storageKey) {
    add("storage", "Supabase Storage · avatars", "failed", "La configuration Storage est incomplète.");
  } else {
    try {
      const url = new URL(storageUrl);
      if (!("https:" === url.protocol || (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)))) throw new Error("invalid protocol");
      const bucket = process.env.SUPABASE_AVATAR_BUCKET || "avatars";
      const response = await fetch(`${url.origin}/storage/v1/bucket/${encodeURIComponent(bucket)}`, { method: "GET", headers: { apikey: storageKey, authorization: `Bearer ${storageKey}` }, cache: "no-store", signal: AbortSignal.timeout(1500) });
      add("storage", "Supabase Storage · avatars", response.ok ? "ok" : "failed", response.ok ? `Le bucket « ${bucket} » répond à la sonde en lecture seule.` : `Le bucket « ${bucket} » a répondu HTTP ${response.status}; vérifiez sa configuration et ses accès.`);
    } catch {
      add("storage", "Supabase Storage · avatars", "failed", "La sonde Storage a échoué ou expiré; les détails réseau et les secrets sont masqués.");
    }
  }

  let runs: HealthRun[] = [];
  let historyReady = true;
  try { runs = await getLatestAdminHealthRuns(["auth", "flows", "sentry", "push", "cron:complete-sessions", "cron:agent-runs"]); }
  catch { historyReady = false; }
  const byType = new Map(runs.map(run => [run.checkType, run]));
  const fromRun = (type: string, name: string, maxAgeMs: number, absent: string, stale: string) => {
    if (!historyReady) { add(type, name, "unknown", "Appliquez la migration SQL 0025_admin_health_check_runs.sql pour conserver et lire l’historique des vérifications."); return; }
    const run = byType.get(type);
    if (!run) { add(type, name, "unknown", absent); return; }
    const checked = new Date(run.checkedAt).getTime();
    const age = Date.now() - checked;
    if (age > maxAgeMs) { add(type, name, "unknown", `${stale} Dernier résultat : ${relative(checked)}.`, run.checkedAt.toISOString()); return; }
    if (run.status === "pending") {
      if (type === "push" && age > 90_000) void completeAdminHealthRun(run.id, run.userId ?? "", "failed", "Aucun accusé du service worker dans les 90 secondes.");
      add(type, name, "unknown", run.detail, run.checkedAt.toISOString()); return;
    }
    const state: HealthState = run.status === "ok" ? "ok" : run.status === "warning" ? "warning" : "failed";
    add(type, name, state, run.detail, run.checkedAt.toISOString());
  };

  const hasHealthAuth = Boolean(process.env.HEALTH_CHECK_BASE_URL && process.env.HEALTH_CHECK_EMAIL && process.env.HEALTH_CHECK_PASSWORD);
  if (!hasHealthAuth) add("auth", "Connexion Auth.js réelle", "not_configured", "Configurez HEALTH_CHECK_BASE_URL, HEALTH_CHECK_EMAIL et HEALTH_CHECK_PASSWORD avec un compte technique dédié.");
  else fromRun("auth", "Connexion Auth.js réelle", 24 * 60 * 60_000, "Lancez le test avec le compte technique dédié pour vérifier les identifiants et la création de session.", "Le test de connexion est périmé.");
  const sentryReady = Boolean(process.env.SENTRY_DSN && process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);
  if (!sentryReady) add("sentry", "Réception Sentry", "not_configured", "Le test envoie un événement puis le recherche via l’API; configurez DSN, jeton project:read, organisation et projet.");
  else fromRun("sentry", "Réception Sentry", 24 * 60 * 60_000, "Envoyez un événement test puis confirmez sa présence dans le projet Sentry.", "Le dernier événement de test Sentry est périmé.");

  const pushKeysReady = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  if (!pushKeysReady) add("push", "Réception Web Push sur cet appareil", "not_configured", "Configurez les clés VAPID serveur et NEXT_PUBLIC_VAPID_PUBLIC_KEY pour tester la réception sur un appareil.");
  else fromRun("push", "Réception Web Push sur cet appareil", 24 * 60 * 60_000, "Autorisez les notifications sur ce navigateur puis lancez le test; le service worker accusera réception après affichage.", "Le test Web Push est périmé.");

  const cronMaxAge = 26 * 60 * 60_000;
  for (const [type, name] of [["cron:complete-sessions", "Cron · séances"], ["cron:agent-runs", "Cron · agents"]]) {
    if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") { add(type, name, "failed", "CRON_SECRET manque en production."); continue; }
    if (!historyReady) { add(type, name, "unknown", "Appliquez la migration 0025 pour conserver l’historique réel des exécutions cron."); continue; }
    const run = byType.get(type);
    if (!run) { add(type, name, "unknown", "Aucune exécution consignée depuis l’ajout de l’historique; attendez la prochaine exécution cron."); continue; }
    const age = Date.now() - new Date(run.checkedAt).getTime();
    if (age > cronMaxAge) add(type, name, "failed", `Aucune exécution depuis plus de 26 h. Dernière exécution : ${relative(new Date(run.checkedAt).getTime())}.`, run.checkedAt.toISOString());
    else add(type, name, run.status === "ok" ? "ok" : run.status === "warning" ? "warning" : "failed", run.detail, run.checkedAt.toISOString());
  }

  if (!hasHealthAuth) add("flows", "Test HTTP connexion et page protégée", "not_configured", "Configurez le compte technique et HEALTH_CHECK_BASE_URL pour tester une connexion réelle et une page protégée en lecture seule.");
  else fromRun("flows", "Test HTTP connexion et page protégée", 24 * 60 * 60_000, "Lancez le test HTTP pour vérifier la connexion réelle et le rendu d’une page protégée en lecture seule.", "Le test HTTP est périmé.");
  add("e2e", "Parcours utilisateur complets automatisés", "unknown", "Aucun parcours complet automatisé n’est configuré. Il faut un environnement de test isolé pour exercer sans risque la publication et la progression des séances.");

  const requiredFailure = checks.some(check => check.state === "failed" && ["database", "auth-config", "storage"].includes(check.id));
  const warning = checks.some(check => check.state === "warning" || check.state === "failed");
  const incomplete = checks.some(check => ["unknown", "not_configured"].includes(check.state));
  const state = requiredFailure ? "action_required" : warning ? "degraded" : incomplete ? "incomplete" : "checked";
  const label = state === "action_required" ? "Action requise" : state === "degraded" ? "Signal à examiner" : state === "incomplete" ? "Contrôles incomplets" : "Vérifications réussies";
  const tone = state === "action_required" ? "unavailable" : warning ? "warning" : "neutral";
  return { state, label, tone, checks, checkedAt };
}

function relative(timestamp: number) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}
