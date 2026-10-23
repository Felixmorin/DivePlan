import Link from "next/link";
import Image from "next/image";
import { Activity, Award, CalendarDays, Computer, Dumbbell, FileText, LayoutDashboard, Library, LogOut, Settings, Users, Waves } from "lucide-react";
import { signOutCoach } from "@/app/coach/settings/actions";
import { requireCoach } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import { SignOutWithPushCleanup } from "@/components/notifications/sign-out-with-push-cleanup";
import { query } from "@/lib/db";

const navFeature: Record<string, string> = {
  "/coach": "dashboard",
  "/coach/planning": "calendar",
  "/coach/planification": "planning",
  "/coach/sessions": "sessions",
  "/coach/athletes": "athletes",
  "/coach/milestones": "simulations",
  "/coach/groups": "groups",
  "/coach/library": "library",
  "/coach/templates": "templates",
  "/coach/observability": "observability",
  "/coach/monitoring": "monitoring",
  "/coach/settings": "settings",
};

const nav = [
  { href: "/coach", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coach/planning", label: "Calendrier", icon: CalendarDays },
  { href: "/coach/planification", label: "Planification", icon: CalendarDays, underConstruction: true },
  { href: "/coach/sessions", label: "Séances", match: "Seances", icon: Activity },
  { href: "/coach/athletes", label: "Athlètes", match: "Athletes", icon: Users },
  { href: "/coach/milestones", label: "Milestones", icon: Award },
  { href: "/coach/groups", label: "Groupes", icon: Dumbbell },
  { href: "/coach/library", label: "Bibliothèque", match: "Bibliotheque", icon: Library },
  { href: "/coach/templates", label: "Template", match: "Template", icon: FileText },
];

const utilityNav = [
  { href: "/coach/observability", label: "Observabilité", icon: Activity },
  { href: "/coach/monitoring", label: "Monitoring", icon: Computer },
  { href: "/coach/settings", label: "Réglages", match: "Reglages", icon: Settings }
];

export async function CoachShell({ children, active }: { children: React.ReactNode; active: string }) {
  const { user } = await requireCoach();
  const blocked = await query<{ featureId: string }>(`SELECT "featureId" FROM "CoachFeatureAccess" WHERE "userId" = $1 AND enabled = FALSE`, [user.id]);
  const blockedFeatures = new Set(blocked.rows.map((row) => row.featureId));
  const availableNav = nav.filter((item) => !navFeature[item.href] || !blockedFeatures.has(navFeature[item.href]));
  const availableUtilityNav = utilityNav.filter((item) => !navFeature[item.href] || !blockedFeatures.has(navFeature[item.href]));
  const visibleNav = availableNav;
  const visibleUtilityNav = availableUtilityNav;
  const clubName = user.club?.name ?? "Performance aquatique";
  const logo = user.club?.logo?.trim();

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--color-coach-bg)] text-[var(--color-ink)]">
      <aside className="fixed left-0 top-0 z-10 hidden h-screen w-68 flex-col border-r border-[var(--color-border)] bg-[var(--color-navy)] px-4 py-6 text-white lg:flex">
        <Link href="/coach" className="mb-8 flex items-center gap-3 rounded-2xl px-2 py-1 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
          <BrandMark logo={logo} clubName={clubName} />
          <div>
            <div className="text-lg font-black">DivePlan</div>
            <div className="max-w-40 truncate text-xs font-semibold uppercase text-white/45">{clubName}</div>
          </div>
        </Link>
        <div className="flex min-h-0 flex-1 flex-col">
          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.label || active === item.match;
              return (
                <Link key={item.href} href={item.href} style={isActive ? { color: "#ffffff" } : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold transition duration-[var(--duration-fast)] hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", isActive ? "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand)]" : "text-white/62")}>
                  <Icon className={cn("h-4 w-4", isActive && "text-white")} />
                  <span className={cn(isActive && "text-white")}>{item.label}</span>
                  {item.underConstruction && <span className="ml-auto rounded-full bg-amber-300/15 px-2 py-1 text-[9px] font-black leading-none text-amber-200">En construction</span>}
                </Link>
              );
            })}
          </nav>
          <nav aria-label="Outils" className="mt-auto flex items-center justify-end gap-2 border-t border-white/10 pt-4">
            {visibleUtilityNav.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.label || active === item.match;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  style={isActive ? { color: "#ffffff" } : undefined}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-xl text-white/55 transition duration-[var(--duration-fast)] hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", isActive && "bg-white/12 text-white")}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.25} />
                </Link>
              );
            })}
            {!hasFullAccess && <SignOutWithPushCleanup action={signOutCoach} className="ml-auto shrink-0">
              <button type="submit" aria-label="Déconnexion" title="Déconnexion" className="flex h-8 w-8 items-center justify-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                <LogOut className="h-4 w-4" />
              </button>
            </SignOutWithPushCleanup>}
          </nav>
        </div>
        <div className="mt-4 flex flex-col items-center gap-2 border-t border-white/10 pt-4">
          <span className="text-xs font-semibold text-white/55">Powered By</span>
          <Image src="/icons/diveplan-powered-by.png" alt="DivePlan" width={168} height={56} className="h-auto w-42" />
        </div>
      </aside>
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-coach-bg)]/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/coach" className="flex items-center gap-2 font-black focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
            <BrandMark logo={logo} clubName={clubName} mobile />
            DivePlan
          </Link>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--color-ink-muted)] shadow-sm">{active}</span>
        </div>
        <nav className="coach-mobile-nav -mx-1 flex max-w-full gap-1 overflow-x-auto pb-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.label || active === item.match;
            return (
              <Link key={item.href} href={item.href} style={isActive ? { color: "#ffffff" } : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-black transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", isActive ? "bg-[var(--color-navy)] text-white hover:text-white" : "text-[var(--color-ink-muted)]")}>
                <Icon className={cn("h-4 w-4", isActive && "text-white")} />
                <span className={cn(isActive && "text-white")}>{item.label}</span>
                {item.underConstruction && <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black leading-none text-amber-800">En construction</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-2 flex items-center gap-1 border-t border-[var(--color-border)] pt-2">
          {visibleUtilityNav.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.label || active === item.match;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                style={isActive ? { color: "#ffffff" } : undefined}
                className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-black transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", isActive ? "bg-[var(--color-navy)] text-white" : "text-[var(--color-ink-muted)] hover:bg-white")}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <SignOutWithPushCleanup action={signOutCoach} className="ml-auto shrink-0">
            <button type="submit" className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black text-[var(--color-ink-muted)] transition duration-[var(--duration-fast)] hover:bg-white focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
              <LogOut className="h-4 w-4" />
              <span>Déconnexion</span>
            </button>
          </SignOutWithPushCleanup>
        </div>
      </header>
      <main className="min-w-0 lg:pl-68">
        <div className="w-full px-3 py-4 sm:px-4 lg:px-5 xl:px-6">{children}</div>
      </main>
    </div>
  );
}

function BrandMark({ logo, clubName, mobile = false }: { logo?: string; clubName: string; mobile?: boolean }) {
  const sizeClass = mobile ? "h-10 w-10" : "h-11 w-11";
  const iconClass = mobile ? "h-5 w-5" : "h-6 w-6";

  if (logo) {
    return (
      <span className={cn("relative flex shrink-0 overflow-hidden rounded-2xl bg-white", sizeClass)}>
        <Image src={logo} alt={`Logo ${clubName}`} fill sizes="44px" className="object-cover" />
      </span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-2xl text-[var(--color-navy)]", mobile ? "bg-[var(--color-navy)] text-[var(--color-brand)]" : "bg-[var(--color-brand)]", sizeClass)}>
      <Waves className={iconClass} />
    </span>
  );
}
