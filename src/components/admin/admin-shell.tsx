import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";
import { requireAdmin } from "@/lib/current-user";
import { getAdminHealth } from "@/lib/admin-health";

type AdminStatus = { label: string; tone: "neutral" | "warning" | "unavailable"; detail: string };

export async function AdminShell({ children }: { children: React.ReactNode; active?: string }) {
  await requireAdmin();
  const health = await getAdminHealth();
  const status: AdminStatus = { label: health.label, tone: health.tone, detail: health.checks.map(check => `${check.name}: ${check.detail}`).join(" ") };
  return <div className="admin-shell min-h-screen bg-[#f3f7fa] text-[var(--color-ink)]">
    <AdminNavigation status={status}/>
    <div className="md:ml-[228px] lg:ml-[252px]">
      <div className="fixed bottom-0 left-0 z-20 hidden w-[228px] border-t border-white/10 bg-[#09233b] px-3 pb-4 pt-3 text-white md:block lg:w-[252px] lg:px-4">
        <AdminThemeToggle placement="sidebar"/>
        <form className="mt-2" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-white/75 hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><LogOut className="h-4 w-4"/>Déconnexion</button></form>
      </div>
      <header className="fixed inset-x-0 top-14 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-2 backdrop-blur md:hidden">
        <span className="ml-auto"><AdminThemeToggle placement="mobile"/></span>
      </header>
      <main className="min-h-screen px-4 pb-8 pt-[108px] sm:px-6 md:px-6 md:py-6 lg:px-7 xl:px-8">{children}</main>
    </div>
  </div>;
}
