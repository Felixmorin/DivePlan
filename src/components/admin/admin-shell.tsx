import Link from "next/link";
import Image from "next/image";
import { Activity, LayoutDashboard, LogOut, Sparkles, UserRound } from "lucide-react";
import { signOut } from "@/auth";
import { requireAdmin } from "@/lib/current-user";

const items = [
  { href: "/admin", label: "Vue d’ensemble", icon: LayoutDashboard },
  { href: "/admin/users", label: "Utilisateurs", icon: UserRound },
  { href: "/admin/coaches", label: "Fonctionnalités", icon: Sparkles },
  { href: "/admin/observability", label: "Observabilité", icon: Activity }
];

export async function AdminShell({ children, active }: { children: React.ReactNode; active: string }) {
  const user = await requireAdmin();
  return <div className="min-h-screen bg-[#f3f7fa] text-[var(--color-ink)]">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[252px] flex-col overflow-hidden bg-[#09233b] px-4 py-5 text-white lg:flex">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(ellipse_at_bottom,_rgba(0,188,212,0.20),_transparent_68%)]" />
      <Link href="/admin" aria-label="DivePlan, accueil administration" className="relative mb-9 flex w-fit items-center px-2 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><Image src="/icons/diveplan-admin-logo.png" alt="DivePlan" width={175} height={52} priority className="h-[52px] w-[175px] object-contain object-left" /></Link>
      <p className="relative mb-3 px-2 text-xs font-bold uppercase tracking-[0.14em] text-white/45">Administration</p>
      <nav aria-label="Navigation admin" className="relative space-y-1">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active === label ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl border-l-2 px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active === label ? "border-cyan-300 bg-gradient-to-r from-sky-700/90 to-sky-600/65 text-white shadow-sm" : "border-transparent text-white/70 hover:bg-white/8 hover:text-white"}`}><Icon className="h-[18px] w-[18px]" />{label}</Link>)}</nav>
      <div className="relative mt-auto border-t border-white/10 pt-4">
        <p className="text-xs font-bold text-white/85">Administrateur plateforme</p><p className="mt-1 truncate text-xs text-white/50">{user.firstName} {user.lastName}</p>
        <form className="mt-3" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-white/70 hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><LogOut className="h-4 w-4" /> Déconnexion</button></form>
      </div>
    </aside>
    <div className="lg:ml-[252px]">
      <header className="sticky top-0 z-10 min-h-[58px] border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6 lg:hidden">
        <nav aria-label="Navigation admin mobile" className="flex min-w-0 gap-1 overflow-x-auto py-2">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active === label ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${active === label ? "bg-[#0b3555] text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="h-4 w-4" />{label}</Link>)}</nav>
      </header>
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-7 xl:px-8">{children}</main>
    </div>
  </div>;
}
