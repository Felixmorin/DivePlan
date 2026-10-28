import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "@/components/ui/app-link";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const documents = [
  ["Carte d’architecture", "docs/architecture/architecture.md"],
  ["Guide général des agents", "docs/agents/guide-general.md"],
  ["Architecte-cartographe", "docs/agents/architecte-cartographe.md"],
  ["Observabilité DivePlan", "docs/agents/observabilite.md"],
  ["Analyste SQL & Supabase", "docs/agents/analyste-sql-supabase.md"]
] as const;

export default async function AgentContextPage() {
  await requireAdmin();
  const contents = await Promise.all(documents.map(async ([title, path]) => {
    try { return { title, path, content: await readFile(join(process.cwd(), path), "utf8") }; }
    catch { return { title, path, content: "Document indisponible dans cet environnement de déploiement. Consulter le dépôt." }; }
  }));
  return <AdminShell active="Agents"><main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <div><Link href="/admin/agents" className="text-sm font-bold text-blue-700 hover:underline">← Retour aux agents</Link><h1 className="mt-3 text-3xl font-black text-slate-950">Contexte DivePlan des agents</h1><p className="mt-1 text-sm text-slate-600">Guides versionnés du dépôt. Les diagrammes Mermaid sont affichés en source.</p></div>
    <nav aria-label="Documents de contexte" className="flex flex-wrap gap-2">{contents.map((doc, index) => <a key={doc.path} href={`#context-${index}`} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800">{doc.title}</a>)}</nav>
    {contents.map((doc, index) => <section id={`context-${index}`} key={doc.path} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 px-4 py-3"><h2 className="font-black text-slate-900">{doc.title}</h2><p className="text-xs text-slate-500">{doc.path}</p></header><pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 text-sm leading-6 text-slate-700">{doc.content}</pre></section>)}
  </main></AdminShell>;
}
