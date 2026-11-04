import Link from "@/components/ui/app-link";
import Image from "next/image";
import { Activity, Award, CalendarDays, ChevronDown, Computer, Dumbbell, FileText, LayoutDashboard, Library, LogOut, Plus, Settings, Users } from "lucide-react";
import { signOutCoach } from "@/app/coach/settings/actions";
import { requireCoach } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import { SignOutWithPushCleanup } from "@/components/notifications/sign-out-with-push-cleanup";
import { query } from "@/lib/db";
import { formatMontrealDate } from "@/lib/timezone";

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
  "/coach/monitoring": "monitoring",
  "/coach/settings": "settings",
};

const nav = [
  { href: "/coach", label: "Accueil", match: "Dashboard", icon: LayoutDashboard },
  { href: "/coach/planning", label: "Calendrier", icon: CalendarDays },
  { href: "/coach/planification", label: "Planification", icon: CalendarDays },
  { href: "/coach/sessions", label: "Séances", match: "Seances", icon: Activity },
  { href: "/coach/athletes", label: "Athlètes", match: "Athletes", icon: Users },
  { href: "/coach/milestones", label: "Milestones", icon: Award },
  { href: "/coach/groups", label: "Groupes", icon: Dumbbell },
  { href: "/coach/library", label: "Bibliothèque", match: "Bibliotheque", icon: Library },
  { href: "/coach/templates", label: "Modèles", match: "Template", icon: FileText },
];

const utilityNav = [
  { href: "/coach/monitoring", label: "Monitoring", icon: Computer },
  { href: "/coach/settings", label: "Réglages", match: "Reglages", icon: Settings }
];

const primaryNavHrefs = new Set(["/coach", "/coach/planning", "/coach/sessions", "/coach/athletes", "/coach/groups"]);

export async function CoachShell({ children, active }: { children: React.ReactNode; active: string; compactHeader?: boolean }) {
  const { user } = await requireCoach();
  const blocked = await query<{ featureId: string }>(`SELECT "featureId" FROM "CoachFeatureAccess" WHERE "userId" = $1 AND enabled = FALSE`, [user.id]);
  const blockedFeatures = new Set(blocked.rows.map((row) => row.featureId));
  const availableNav = nav.filter((item) => !navFeature[item.href] || !blockedFeatures.has(navFeature[item.href]));
  const availableUtilityNav = utilityNav.filter((item) => !navFeature[item.href] || !blockedFeatures.has(navFeature[item.href]));
  const hasPlanificationAccess = user.email.trim().toLowerCase() === "felix@diveplan.com";
  const visibleNav = availableNav.filter((item) => item.href !== "/coach/planification" || hasPlanificationAccess);
  const primaryNav = visibleNav.filter((item) => primaryNavHrefs.has(item.href));
  const overflowNav = [
    ...visibleNav.filter((item) => !primaryNavHrefs.has(item.href)),
    ...availableUtilityNav.filter((item) => item.href === "/coach/monitoring")
  ];
  const profileNav = availableUtilityNav.filter((item) => item.href === "/coach/settings");
  const clubName = user.club?.name ?? "Performance aquatique";
  const logo = user.club?.logo?.trim();
  const accountInitials = `${user.firstName.slice(0, 1)}${user.lastName.slice(0, 1)}`;
  const createSessionHref = user.clubId === "dev-club" ? "/coach/sessions/demo" : "/coach/sessions/new";

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--color-coach-bg)] text-[var(--color-ink)]">
      <header className="sticky top-3 z-30 mx-3 mt-3 rounded-[20px] border border-[#d7e4ec] bg-white shadow-[0_3px_15px_rgba(30,75,120,.035)] sm:mx-5 xl:mx-[34px]">
        <div className="flex min-h-[76px] items-center gap-2 px-3 sm:gap-3 sm:px-4 xl:gap-5 xl:px-[18px]">
          <Link href="/coach" aria-label="DivePlan, accueil coach" className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] focus-visible:ring-offset-2">
            <BrandMark logo={logo} clubName={clubName} mobile />
            <span className="text-[19px] font-bold tracking-[-.02em] text-[var(--color-navy)] sm:text-[21px]">DivePlan</span>
          </Link>

          <nav aria-label="Navigation principale coach" className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex xl:gap-1">
            {primaryNav.map((item) => <CoachNavLink key={item.href} item={item} active={active} compact />)}
            {overflowNav.length > 0 && <details className="group relative shrink-0">
              <summary className={cn("flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-xl px-2 text-[13px] font-semibold text-[#52677f] transition-colors duration-[var(--duration-fast)] marker:hidden hover:bg-[#f1f7fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] sm:px-2.5", overflowNav.some((item) => active === item.label || active === item.match) && "bg-[#eaf4ff] text-[#0969ef]")}>Plus <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"/></summary>
              <div className="absolute left-0 top-full z-40 mt-2 min-w-52 rounded-xl border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-ink)] shadow-lg">
                {overflowNav.map((item) => <CoachMenuLink key={item.href} item={item} active={active}/>) }
              </div>
            </details>}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5 xl:gap-3">
            <span className="hidden items-center gap-2 whitespace-nowrap text-sm font-semibold capitalize text-[var(--color-ink-muted)] 2xl:inline-flex"><CalendarDays aria-hidden="true" className="h-4 w-4 text-[#0797b1]"/>{formatMontrealDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</span>
            <span aria-hidden="true" className="hidden h-8 w-px bg-[#dce6ef] 2xl:block"/>
            <details className="group relative shrink-0">
              <summary aria-label={`Menu du profil : ${user.firstName} ${user.lastName}`} title={`${user.firstName} ${user.lastName}`} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-[#d7e4ec] bg-[#eaf4ff] text-xs font-bold text-[#155ca8] transition-colors duration-[var(--duration-fast)] marker:hidden hover:border-[#93c8f2] hover:bg-[#dcedff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] focus-visible:ring-offset-2">{accountInitials}</summary>
              <div className="absolute right-0 top-full z-40 mt-2 min-w-56 rounded-xl border border-[var(--color-border)] bg-white p-2 text-[var(--color-ink)] shadow-lg">
                <div className="mb-1 border-b border-[var(--color-border)] px-3 pb-2"><strong className="block truncate text-sm font-bold">{user.firstName} {user.lastName}</strong><span className="block truncate text-xs text-[var(--color-ink-muted)]">{user.email}</span></div>
                {profileNav.map((item) => <CoachMenuLink key={item.href} item={item} active={active}/>) }
                <SignOutWithPushCleanup action={signOutCoach} className="block border-t border-[var(--color-border)] pt-1">
                  <button type="submit" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-[var(--color-ink-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] motion-reduce:transition-none"><LogOut aria-hidden="true" className="h-4 w-4"/>Déconnexion</button>
                </SignOutWithPushCleanup>
              </div>
            </details>
            <Link href={createSessionHref} className="inline-flex h-11 min-h-11 items-center gap-2 rounded-[13px] bg-[#0969ef] px-3 text-sm font-semibold text-white transition-colors duration-[var(--duration-fast)] hover:bg-[#0757cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] focus-visible:ring-offset-2 motion-reduce:transition-none sm:px-3.5 lg:h-12 lg:min-h-12 lg:px-4">
              <Plus aria-hidden="true" className="h-4 w-4 shrink-0"/><span className="hidden lg:inline">Créer une séance</span>
            </Link>
          </div>
        </div>

        <nav aria-label="Navigation coach" className="coach-mobile-nav flex max-w-full gap-1 overflow-x-auto border-t border-[#edf2f6] px-2 py-1.5 md:hidden">
          {primaryNav.map((item) => <CoachNavLink key={item.href} item={item} active={active}/>) }
          {overflowNav.length > 0 && <details className="group relative shrink-0">
            <summary className={cn("flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-xl px-3 text-xs font-semibold text-[#52677f] hover:bg-[#f1f7fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7]", overflowNav.some((item) => active === item.label || active === item.match) && "bg-[#eaf4ff] text-[#0969ef]")}>Plus <ChevronDown aria-hidden="true" className="h-3.5 w-3.5"/></summary>
            <div className="absolute right-0 top-full z-40 mt-2 min-w-52 rounded-xl border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-ink)] shadow-lg">
              {overflowNav.map((item) => <CoachMenuLink key={item.href} item={item} active={active}/>) }
            </div>
          </details>}
        </nav>
      </header>
      <main className="min-w-0">
        <div className="w-full px-3 py-4 sm:px-4 lg:px-5 xl:px-6">{children}</div>
      </main>
    </div>
  );
}

type CoachNavigationItem = { href: string; label: string; match?: string; icon: React.ElementType };

function CoachNavLink({ item, active, compact = false }: { item: CoachNavigationItem; active: string; compact?: boolean }) {
  const Icon = item.icon;
  const isActive = active === item.label || active === item.match;
  return <Link href={item.href} aria-current={isActive ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-xl font-semibold transition-colors duration-[var(--duration-fast)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7] focus-visible:ring-offset-1", compact ? "gap-1.5 px-2 text-[13px] lg:gap-2 lg:px-2.5" : "px-3 text-xs", isActive ? "bg-[#eaf4ff] text-[#0969ef]" : "text-[#52677f] hover:bg-[#f1f7fb] hover:text-[var(--color-navy)]")}>
    <Icon aria-hidden="true" className="h-4 w-4 shrink-0"/><span>{item.label}</span>
  </Link>;
}

function CoachMenuLink({ item, active }: { item: CoachNavigationItem; active: string }) {
  const Icon = item.icon;
  const isActive = active === item.label || active === item.match;
  return <Link href={item.href} aria-current={isActive ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-[var(--duration-fast)] motion-reduce:transition-none hover:bg-[var(--color-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1685f7]", isActive ? "bg-[#eaf4ff] text-[#0969ef]" : "text-[var(--color-ink-muted)]")}>
    <Icon aria-hidden="true" className="h-4 w-4"/>{item.label}
  </Link>;
}

function BrandMark({ logo, clubName, mobile = false }: { logo?: string; clubName: string; mobile?: boolean }) {
  const sizeClass = mobile ? "h-10 w-10" : "h-11 w-11";

  if (logo) {
    return (
      <span className={cn("relative flex shrink-0 overflow-hidden rounded-[14px] bg-white", sizeClass)}>
        <Image src={logo} alt={`Logo ${clubName}`} fill sizes="44px" className="object-cover" />
      </span>
    );
  }

  return (
    <span className={cn("relative flex shrink-0 overflow-hidden rounded-[14px] bg-[var(--color-navy)]", sizeClass)}>
      <Image src="/icons/diveplan.svg" alt="Logo DivePlan" fill sizes="44px" className="object-cover" />
    </span>
  );
}
