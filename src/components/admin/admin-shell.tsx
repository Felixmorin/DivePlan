import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";

type AdminStatus = { label: string; tone: "neutral" | "warning" | "unavailable"; detail: string };

export async function AdminShell({ children }: { children: React.ReactNode; active?: string }) {
  const user = await requireAdmin();
  let status: AdminStatus = { label: "État indisponible", tone: "unavailable", detail: "La sonde de statut ne peut pas confirmer l’état de la plateforme." };
  try {
    const result = await query<{ errors: string }>(`SELECT count(*)::text AS errors FROM "AppEvent" WHERE "createdAt" >= NOW() - INTERVAL '24 hours' AND (type ILIKE '%error%' OR type ILIKE '%exception%' OR type = 'system.failure')`);
    const errors = Number(result.rows[0]?.errors ?? 0);
    status = errors > 0
      ? { label: "Signal à examiner", tone: "warning", detail: `${errors.toLocaleString("fr-CA")} événement(s) d’erreur consignés dans AppEvent au cours des dernières 24 heures. D’autres indicateurs de santé ne sont pas vérifiés ici.` }
      : { label: "Surveillance partielle", tone: "neutral", detail: "AppEvent ne contient aucun événement d’erreur détecté sur 24 heures. Les parcours, services externes et incidents actifs ne sont pas vérifiés par cette sonde." };
  } catch {
    status = { label: "État indisponible", tone: "unavailable", detail: "La lecture des événements de santé est indisponible; le fonctionnement global ne peut pas être confirmé." };
  }
  return <div className="admin-shell min-h-screen bg-[#f3f7fa] text-[var(--color-ink)]">
    <AdminNavigation status={status}/>
    <div className="md:ml-[228px] lg:ml-[252px]">
      <div className="fixed bottom-0 left-0 z-20 hidden w-[228px] border-t border-white/10 bg-[#09233b] px-3 pb-4 pt-3 text-white md:block lg:w-[252px] lg:px-4">
        <AdminThemeToggle placement="sidebar"/>
        <p className="mt-2 text-xs font-bold text-white/85">Administrateur plateforme</p><p className="mt-1 truncate text-xs text-white/60">{user.firstName} {user.lastName}</p>
        <form className="mt-2" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-white/75 hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><LogOut className="h-4 w-4"/>Déconnexion</button></form>
      </div>
      <header className="fixed inset-x-0 top-14 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-2 backdrop-blur md:hidden">
        <span className="truncate text-xs font-semibold text-slate-600">{user.firstName} {user.lastName}</span><AdminThemeToggle placement="mobile"/>
      </header>
      <main className="min-h-screen px-4 pb-8 pt-[108px] sm:px-6 md:px-6 md:py-6 lg:px-7 xl:px-8">{children}</main>
    </div>
  </div>;
}

