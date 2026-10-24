import "server-only";
import { execFileSync } from "node:child_process";
import { analyzeDivePlanSqlCode, loadDivePlanSources } from "@/lib/sql-agent-analysis";

export async function runArchitectureCartography(previous?: { analyzedCommit?: string; summary?: string; pages?: string[]; apiRoutes?: string[]; models?: string[] }) {
  const analyzedAt = new Date().toISOString();
  const commit = getCommitReference();
  const loaded = await loadDivePlanSources();
  const sql = await analyzeDivePlanSqlCode();
  const appFiles = loaded.files.filter((file) => file.path.startsWith("src/app/"));
  const routes = appFiles.filter((file) => /\/page\.tsx?$/.test(file.path) || /\/route\.tsx?$/.test(file.path));
  const apiRoutes = routes.filter((file) => file.path.includes("/api/")).map((file) => routeName(file.path));
  const pages = routes.filter((file) => !file.path.includes("/api/")).map((file) => routeName(file.path));
  const models = extractModelNames(loaded.files.find((file) => file.path === "prisma/schema.prisma")?.content ?? "");
  const manifest = parsePackageManifest(loaded.files.find((file) => file.path === "package.json")?.content);
  const permissions = loaded.files.flatMap((file) => [...file.content.matchAll(/requireAdmin\(|requireCoach\(|requireAthlete\(|requireCurrentUser\(["'](ADMIN|COACH|ATHLETE)["']\)/g)].map((match) => `${file.path}: ${match[0]}`)).slice(0, 30);
  const agentNames = await readConfiguredAgentNames();
  const summary = `Cartographie de ${pages.length} pages, ${apiRoutes.length} routes API, ${models.length} modèles Prisma et ${loaded.files.length} fichiers sources.`;
  const changeDetails = previous
    ? [
      ...diffNames("Pages", previous.pages, pages),
      ...diffNames("Routes API", previous.apiRoutes, apiRoutes),
      ...diffNames("Modèles", previous.models, models)
    ]
    : [];
  const sourceChanges = previous?.analyzedCommit ? getSourceChanges(previous.analyzedCommit, commit) : [];
  const changes = previous?.analyzedCommit
    ? previous.analyzedCommit === commit
      ? changeDetails.length ? `Même commit Git (${commit}); différences d’inventaire détectées: ${changeDetails.join("; ")}` : `Même commit que la cartographie précédente (${commit}); aucun changement d’inventaire détecté.`
      : `Commit précédent ${previous.analyzedCommit}; commit courant ${commit}. ${sourceChanges.length ? `Fichiers source modifiés: ${sourceChanges.join(", ")}.` : changeDetails.length ? changeDetails.join("; ") : "Aucun diff de fichiers disponible; l’inventaire de routes et modèles n’a pas changé."}`
    : "Aucune cartographie précédente disponible pour cette comparaison.";

  return {
    title: "Cartographie d’architecture DivePlan",
    period: { from: analyzedAt, to: analyzedAt, label: "État du dépôt au lancement" },
    analyzedAt,
    analyzedCommit: commit,
    summary,
    changes,
    changeDetails,
    sourceChanges,
    scope: "src/app (routes et vues), src/lib (services), prisma/schema.prisma, prisma/migrations, db/migrations, fichiers de configuration et documentation disponible dans les sources déployées.",
    sources: [
      { name: "src/app", period: "Instantané du dépôt", samples: routes.length },
      { name: "src/lib", period: "Instantané du dépôt", samples: loaded.files.filter((file) => file.path.startsWith("src/lib/")).length },
      { name: "prisma/schema.prisma", period: "Instantané du dépôt", samples: models.length },
      { name: "Prisma et migrations SQL", period: "Instantané du dépôt", samples: loaded.files.filter((file) => /migrations\//.test(file.path)).length }
    ],
    pages,
    apiRoutes,
    models,
    dependencies: manifest.dependencies.map((item) => `${item.name}@${item.version}`),
    devDependencies: manifest.devDependencies.map((item) => `${item.name}@${item.version}`),
    agents: agentNames,
    permissions,
    diagrams: [
      { title: "Architecture", references: "src/app · src/lib/db.ts · src/auth.ts · src/lib/web-push.ts · vercel.json", mermaid: "flowchart LR\n  Browser[" + '"Navigateur · React 19"' + "] --> App[" + '"Next.js 16 · App Router"' + "]\n  App --> Auth[" + '"Auth.js v5 · credentials"' + "]\n  App --> Services[" + '"src/lib · logique métier"' + "]\n  Services --> PG[" + '"PostgreSQL · pg"' + "]\n  Services --> Storage[" + '"Supabase Storage · avatars"' + "]\n  App --> Push[" + '"Web Push"' + "]\n  App --> Sentry[" + '"Sentry · instrumentation"' + "]\n  Vercel[" + '"Vercel · configuration présente"' + "] --> App\n  Cron[" + '"Vercel Cron · vercel.json"' + "] --> API[" + '"Route handlers /api/cron"' + "] --> PG" },
      { title: "Composants", references: "src/app/layout.tsx · src/lib/current-user.ts · src/app/admin/agents/actions.ts · src/lib/agent-worker.ts", mermaid: "flowchart TD\n  Layout[" + '"src/app/layout.tsx"' + "] --> Coach[" + '"Coach shell et routes"' + "]\n  Layout --> Athlete[" + '"Routes athlète"' + "]\n  Layout --> Admin[" + '"Admin shell et routes"' + "]\n  Coach --> GuardC[" + '"requireCoach"' + "] --> CoachData[" + '"Services coach"' + "]\n  Athlete --> GuardA[" + '"requireAthlete"' + "] --> AthleteData[" + '"Services athlète"' + "]\n  Admin --> GuardD[" + '"requireAdmin"' + "] --> AdminActions[" + '"Server Actions admin"' + "]\n  AdminActions --> Worker[" + '"agent-worker.ts"' + "] --> DB[" + '"AiAgent / AiAgentRun"' + "]" },
      { title: "Parcours de séance athlète", references: "src/app/athlete/session/[id]/ · src/app/api/athlete/session-progress/route.ts · src/lib/athlete-session.ts", mermaid: "sequenceDiagram\n  actor Athlete\n  participant Page as /athlete/session/[id]\n  participant Auth as Auth.js / current-user\n  participant Service as src/lib/athlete-session\n  participant DB as PostgreSQL\n  Athlete->>Page: ouvre une séance\n  Page->>Auth: requireAthlete()\n  Page->>Service: charge séance assignée\n  Service->>DB: lit séance et blocs\n  Athlete->>Page: suit le bloc\n  Page->>DB: persiste progression et feedback" },
      { title: "Données principales", references: "prisma/schema.prisma · db/migrations/ · prisma/migrations/", mermaid: "erDiagram\n  Club ||--o{ User : regroupe\n  Club ||--o{ Athlete : contient\n  Club ||--o{ Coach : contient\n  TrainingGroup ||--o{ Athlete : regroupe\n  TrainingWeek ||--o{ TrainingSession : planifie\n  TrainingSession ||--o{ SessionBlock : compose\n  SessionBlock ||--o{ SessionBlockAssignment : assigne\n  Athlete ||--o{ SessionBlockAssignment : suit\n  Athlete ||--o{ AthleteSessionCompletion : complete\n  Athlete ||--o{ AthleteDiveLog : enregistre\n  AiAgent ||--o{ AiAgentRun : execute" },
      { title: "Déploiement configuré", references: "vercel.json · next.config.ts · README.md", mermaid: "flowchart LR\n  Git[" + '"Dépôt source"' + "] --> Vercel[" + '"Vercel · déploiement indiqué par le dépôt"' + "]\n  Vercel --> Web[" + '"Next.js App Router"' + "]\n  Cron[" + '"Cron quotidien dans vercel.json"' + "] --> Web\n  Web --> PG[" + '"PostgreSQL configuré par DATABASE_URL"' + "]\n  Web --> Supabase[" + '"Supabase Storage optionnel"' + "]\n  Web --> Push[" + '"Web Push optionnel"' + "]\n  Web --> Sentry[" + '"Sentry instrumentation"' + "]" }
    ],
    facts: [
      { category: "Routes", fact: `${pages.length} pages et ${apiRoutes.length} routes API repérées dans les fichiers App Router.`, evidence: "Inventaire des fichiers page.tsx et route.ts dans src/app." },
      { category: "Données", fact: `${models.length} modèles Prisma inventoriés; les migrations SQL PostgreSQL sont également incluses dans le périmètre.`, evidence: "prisma/schema.prisma, prisma/migrations et db/migrations." },
      { category: "Dépendances", fact: `${manifest.dependencies.length} dépendances applicatives et ${manifest.devDependencies.length} dépendances de développement listées.`, evidence: `package.json: ${manifest.dependencies.map((item) => item.name).join(", ")}` },
      { category: "Permissions", fact: `${permissions.length} gardes d’accès de rôle repérés dans les sources d’authentification.`, evidence: permissions.slice(0, 8).join("; ") || "Aucun appel de garde détecté dans le sous-ensemble analysé." },
      { category: "SQL", fact: `${sql.queryCount} appels SQL extraits de ${sql.fileCount} fichiers sources.`, evidence: "Analyse statique sans exécution des requêtes." }
    ],
    findings: [],
    recommendations: ["Lire docs/architecture/architecture.md pour la carte vérifiée et ses références.", "Lire docs/agents/guide-general.md avant toute analyse du dépôt.", "Valider les politiques RLS, les variables d’environnement de production et les relations non documentées depuis un accès autorisé."],
    assumptions: ["Les déductions de parcours suivent les appels visibles dans le code; elles ne remplacent pas une trace d’exécution.", "Le diagramme de déploiement reflète uniquement vercel.json et la configuration présente dans le dépôt."],
    missing: [...loaded.unavailableRoots.map((root) => `Répertoire source inaccessible dans cet environnement: ${root}.`), "Les politiques RLS et la configuration effective de production ne sont pas consultées.", "Les données personnelles et les valeurs des variables d’environnement ne sont jamais incluses."],
    previousSummary: previous?.summary ?? null
  };
}

function routeName(file: string) {
  return file.replace(/^src\/app/, "").replace(/\/page\.tsx?$/, "") .replace(/\/route\.tsx?$/, " (API)") || "/";
}

function extractModelNames(schema: string) {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
}

function parsePackageManifest(content?: string) {
  try {
    const parsed = JSON.parse(content ?? "{}") as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return {
      dependencies: Object.entries(parsed.dependencies ?? {}).map(([name, version]) => ({ name, version })),
      devDependencies: Object.entries(parsed.devDependencies ?? {}).map(([name, version]) => ({ name, version }))
    };
  } catch { return { dependencies: [], devDependencies: [] }; }
}

function diffNames(label: string, before: string[] | undefined, after: string[]) {
  if (!before) return [];
  const oldNames = new Set(before);
  const newNames = new Set(after);
  const added = [...newNames].filter((name) => !oldNames.has(name));
  const removed = [...oldNames].filter((name) => !newNames.has(name));
  return [...(added.length ? [`${label} ajoutés: ${added.join(", ")}`] : []), ...(removed.length ? [`${label} retirés: ${removed.join(", ")}`] : [])];
}

function getCommitReference() {
  const configured = process.env.VERCEL_GIT_COMMIT_SHA;
  if (configured && /^[a-f0-9]{7,40}$/i.test(configured)) return configured;
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }).trim(); }
  catch { return "inconnu (métadonnée Git absente de l’environnement)"; }
}

function getSourceChanges(previous: string, current: string) {
  if (!/^[a-f0-9]{7,40}$/i.test(previous) || !/^[a-f0-9]{7,40}$/i.test(current) || previous === current) return [];
  try {
    return execFileSync("git", ["diff", "--name-only", `${previous}..${current}`, "--", "src/app", "src/lib", "src/components", "src/auth.ts", "prisma", "db", "vercel.json", "next.config.ts"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000, maxBuffer: 64 * 1024
    }).trim().split(/\r?\n/).filter(Boolean).slice(0, 40);
  } catch { return []; }
}

async function readConfiguredAgentNames(): Promise<string[]> {
  try {
    const { query } = await import("@/lib/db");
    const result = await query<{ name: string }>(`SELECT name FROM "AiAgent" ORDER BY name`);
    return result.rows.map((row) => row.name);
  } catch { return []; }
}

export function summarizePreviousCartography(result: unknown) {
  if (!result || typeof result !== "object") return undefined;
  const record = result as { analyzedCommit?: unknown; summary?: unknown; pages?: unknown; apiRoutes?: unknown; models?: unknown };
  return {
    analyzedCommit: typeof record.analyzedCommit === "string" ? record.analyzedCommit : undefined,
    summary: typeof record.summary === "string" ? record.summary : undefined,
    pages: Array.isArray(record.pages) ? record.pages.filter((item): item is string => typeof item === "string") : undefined,
    apiRoutes: Array.isArray(record.apiRoutes) ? record.apiRoutes.filter((item): item is string => typeof item === "string") : undefined,
    models: Array.isArray(record.models) ? record.models.filter((item): item is string => typeof item === "string") : undefined
  };
}
