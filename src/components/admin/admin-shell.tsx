import Link from "next/link";
import { Activity, LayoutDashboard, LogOut, Users } from "lucide-react";
import { signOut } from "@/auth";
import { requireAdmin } from "@/lib/current-user";

const items = [
  { href: "/admin", label: "Vue d’ensemble", icon: LayoutDashboard },
  { href: "/admin/coaches", label: "Accès coach", icon: Users },
  { href: "/admin/observability", label: "Observabilité", icon: Activity }
];

export async function AdminShell({ children, active }: { children: React.ReactNode; active: string }) {
  const user = await requireAdmin();
  return <div className="min-h-screen bg-[var(--color-coach-bg)] text-[var(--color-ink)]">
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[var(--color-navy)] p-5 text-white lg:flex">
      <Link href="/admin" className="mb-8 text-xl font-black">DivePlan <span className="text-xs uppercase text-white/50">Admin</span></Link>
      <nav className="space-y-1">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${active === label ? "bg-[var(--color-brand)] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4" />{label}</Link>)}</nav>
      <div className="mt-auto border-t border-white/10 pt-4">
        <p className="mb-3 truncate text-xs text-white/60">{user.firstName} {user.lastName} · {user.email}</p>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white"><LogOut className="h-4 w-4" /> Déconnexion</button></form>
      </div>
    </aside>
    <header className="sticky top-0 z-10 border-b bg-white px-4 py-3 lg:hidden"><nav className="flex gap-2 overflow-x-auto">{items.map(({ href, label }) => <Link key={href} href={href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${active === label ? "bg-[var(--color-navy)] text-white" : "bg-slate-100"}`}>{label}</Link>)}</nav></header>
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:ml-64 lg:px-8">{children}</main>
  </div>;
}
