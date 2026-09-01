import Link from "next/link";
import { Activity, BarChart3, CalendarDays, Dumbbell, LayoutDashboard, Library, Send, Users, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/coach", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coach/planning", label: "Planning", icon: CalendarDays },
  { href: "/coach/sessions", label: "Séances", match: "Seances", icon: Activity },
  { href: "/coach/athletes", label: "Athlètes", match: "Athletes", icon: Users },
  { href: "/coach/groups", label: "Groupes", icon: Dumbbell },
  { href: "/coach/invitations", label: "Invitations", icon: Send },
  { href: "/coach/monitoring", label: "Monitoring", icon: BarChart3 },
  { href: "/coach/library", label: "Bibliothèque", match: "Bibliotheque", icon: Library }
];

export function CoachShell({ children, active }: { children: React.ReactNode; active: string }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--color-coach-bg)] text-[var(--color-ink)]">
      <aside className="fixed left-0 top-0 z-10 hidden h-screen w-68 border-r border-[var(--color-border)] bg-[var(--color-navy)] px-4 py-6 text-white lg:block">
        <Link href="/coach" className="mb-8 flex items-center gap-3 rounded-2xl px-2 py-1 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-brand)] text-[var(--color-navy)]">
            <Waves className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-black">DivePlan</div>
            <div className="text-xs font-semibold uppercase text-white/45">Performance aquatique</div>
          </div>
        </Link>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.label || active === item.match;
            return (
              <Link key={item.href} href={item.href} className={cn("flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold text-white/62 transition duration-[var(--duration-fast)] hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", isActive && "bg-[var(--color-brand)] text-[var(--color-navy)] hover:bg-[var(--color-brand)] hover:text-[var(--color-navy)]")}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-coach-bg)]/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/coach" className="flex items-center gap-2 font-black focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-navy)] text-[var(--color-brand)]"><Waves className="h-5 w-5" /></span>
            DivePlan
          </Link>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--color-ink-muted)] shadow-sm">{active}</span>
        </div>
        <nav className="coach-mobile-nav -mx-1 flex max-w-full gap-1 overflow-x-auto pb-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.label || active === item.match;
            return (
              <Link key={item.href} href={item.href} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-black text-[var(--color-ink-muted)] transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", isActive && "bg-[var(--color-navy)] text-white")}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="min-w-0 lg:pl-68">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
