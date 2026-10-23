import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CircleUserRound, Filter, Mail, Search, Shield, UserRoundPlus, Users, X } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import { formatMontrealDate } from "@/lib/timezone";
import { reassignCoachClub, setCoachAccess } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "ADMIN" | "COACH" | "ATHLETE";
  clubId: string | null;
  clubName: string | null;
  accessEnabled: boolean;
  passwordSetAt: Date | null;
  createdAt: Date;
  latestActivity: Date | null;
};
type ClubRow = { id: string; name: string };

const roleLabels: Record<UserRow["role"], string> = {
  ADMIN: "Administrateur",
  COACH: "Coach",
  ATHLETE: "Athlète"
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; club?: string; status?: string; page?: string; user?: string; created?: string; updated?: string; error?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const search = params.q?.trim().slice(0, 120) ?? "";
  const role = ["ADMIN", "COACH", "ATHLETE"].includes(params.role ?? "") ? params.role! : "";
  const clubId = params.club ?? "";
  const status = ["active", "disabled", "setup"].includes(params.status ?? "") ? params.status! : "";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.page ?? "1", 10) || 1));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  const searchPattern = search ? `%${search}%` : null;
  const roleFilter = role || null;
  const clubFilter = clubId || null;
  const statusFilter = status || null;
  const filterValues = [searchPattern, roleFilter, clubFilter, statusFilter] as const;
  const where = `($1::text IS NULL OR concat_ws(' ', u."firstName", u."lastName", u.email) ILIKE $1)
    AND ($2::text IS NULL OR u.role::text = $2)
    AND ($3::text IS NULL OR ($3 = 'none' AND u."clubId" IS NULL) OR u."clubId" = $3)
    AND ($4::text IS NULL OR ($4 = 'active' AND u."accessEnabled") OR ($4 = 'disabled' AND NOT u."accessEnabled") OR ($4 = 'setup' AND u."accessEnabled" AND u."passwordSetAt" IS NULL))`;
  const [users, count, stats, clubs] = await Promise.all([
    query<UserRow>(`SELECT u.id, u."firstName", u."lastName", u.email, u.role, u."clubId", c.name AS "clubName", u."accessEnabled", u."passwordSetAt", u."createdAt", activity."createdAt" AS "latestActivity"
      FROM "User" u LEFT JOIN "Club" c ON c.id = u."clubId"
      LEFT JOIN LATERAL (SELECT "createdAt" FROM "AppEvent" WHERE "userId" = u.id ORDER BY "createdAt" DESC LIMIT 1) activity ON TRUE
      WHERE ${where}
      ORDER BY u."createdAt" DESC, u."lastName", u."firstName"
      LIMIT $5 OFFSET $6`, [...filterValues, pageSize, offset]),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM "User" u WHERE ${where}`, filterValues),
    query<{ total: string; active: string; disabled: string; admins: string }>(`SELECT count(*)::text AS total, count(*) FILTER (WHERE "accessEnabled")::text AS active, count(*) FILTER (WHERE NOT "accessEnabled")::text AS disabled, count(*) FILTER (WHERE role = 'ADMIN')::text AS admins FROM "User"`),
    query<ClubRow>(`SELECT id, name FROM "Club" ORDER BY name`)
  ]);
  const total = Number(count.rows[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const selected = users.rows.find((user) => user.id === params.user) ?? users.rows[0] ?? null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + users.rows.length, total);

  function href(overrides: Partial<{ q: string; role: string; club: string; status: string; page: number; user: string | null }> = {}) {
    const values = { q: search, role, club: clubId, status, page, user: selected?.id ?? "", ...overrides };
    const queryParams = new URLSearchParams();
    if (values.q) queryParams.set("q", values.q);
    if (values.role) queryParams.set("role", values.role);
    if (values.club) queryParams.set("club", values.club);
    if (values.status) queryParams.set("status", values.status);
    if (values.page > 1) queryParams.set("page", String(values.page));
    if (values.user) queryParams.set("user", values.user);
    const queryString = queryParams.toString();
    return `/admin/users${queryString ? `?${queryString}` : ""}`;
  }

  const errors: Record<string, string> = {
    invalid: "La demande est invalide. Rechargez la page et réessayez.",
    "not-found": "Ce compte ou ce club n’existe plus."
  };

  return <AdminShell active="Utilisateurs">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl font-black tracking-tight">Utilisateurs</h1><p className="mt-1 text-sm text-slate-500">Gérez les comptes et les accès de DivePlan.</p></div>
      <Link href="/admin/coaches" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-800 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><UserRoundPlus className="h-4 w-4" />Créer un compte coach</Link>
    </header>

    {(params.error || params.updated || params.created) && <p role={params.error ? "alert" : "status"} className={`mb-4 rounded-xl border p-3 text-sm font-semibold ${params.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{params.error ? errors[params.error] ?? "La demande n’a pas pu être traitée." : "Les informations du compte ont été mises à jour."}</p>}

    <section aria-label="Résumé des comptes" className="mb-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <SummaryCard icon={Users} label="Comptes" value={stats.rows[0]?.total ?? "0"} tone="blue" />
      <SummaryCard icon={Check} label="Actifs" value={stats.rows[0]?.active ?? "0"} tone="green" />
      <SummaryCard icon={X} label="Désactivés" value={stats.rows[0]?.disabled ?? "0"} tone="amber" />
      <SummaryCard icon={Shield} label="Administrateurs" value={stats.rows[0]?.admins ?? "0"} tone="violet" />
    </section>

    <div className="grid items-start gap-3 2xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Liste des utilisateurs">
        <form method="get" action="/admin/users" className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.5fr)_repeat(3,minmax(120px,1fr))_auto]">
          <label className="relative block"><span className="sr-only">Rechercher un utilisateur</span><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" name="q" defaultValue={search} placeholder="Nom ou courriel…" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" /></label>
          <label><span className="sr-only">Filtrer par rôle</span><select name="role" defaultValue={role} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"><option value="">Tous les rôles</option><option value="ADMIN">Administrateur</option><option value="COACH">Coach</option><option value="ATHLETE">Athlète</option></select></label>
          <label><span className="sr-only">Filtrer par club</span><select name="club" defaultValue={clubId} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"><option value="">Tous les clubs</option><option value="none">Aucun club</option>{clubs.rows.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
          <label><span className="sr-only">Filtrer par statut</span><select name="status" defaultValue={status} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"><option value="">Tous les statuts</option><option value="active">Actif</option><option value="disabled">Désactivé</option><option value="setup">Mot de passe à configurer</option></select></label>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><Filter className="h-4 w-4" />Filtrer</button>
          <input type="hidden" name="page" value="1" />
        </form>

        <div className="overflow-x-auto"><table className="w-full min-w-[690px] text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-600"><tr><th className="w-10 px-3 py-3"><span className="sr-only">Sélection</span></th><th className="px-2 py-3">Utilisateur</th><th className="px-2 py-3">Rôle</th><th className="px-2 py-3">Club</th><th className="px-2 py-3">Statut</th><th className="px-2 py-3">Dernière activité</th></tr></thead><tbody>{users.rows.map((user) => {
          const isSelected = selected?.id === user.id;
          return <tr key={user.id} className={`border-t border-slate-100 transition-colors ${isSelected ? "bg-sky-50" : "hover:bg-slate-50/70"}`}>
            <td className="px-3 py-2.5"><Link href={href({ user: user.id })} aria-label={`Afficher ${user.firstName} ${user.lastName}`} aria-current={isSelected ? "true" : undefined} className={`grid h-4 w-4 place-items-center rounded border ${isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{isSelected && <Check className="h-3 w-3" />}</Link></td>
            <td className="px-2 py-2.5"><Link href={href({ user: user.id })} className="flex min-w-48 items-center gap-2.5 rounded focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><Avatar user={user} /><span className="min-w-0"><span className="block truncate font-bold text-slate-800">{user.firstName} {user.lastName}</span><span className="block max-w-48 truncate text-[10px] text-slate-500">{user.email}</span></span></Link></td>
            <td className="px-2 py-2.5"><RoleBadge role={user.role} /></td><td className="max-w-32 truncate px-2 py-2.5 text-slate-600">{user.clubName ?? "Aucun club"}</td>
            <td className="px-2 py-2.5"><StatusBadge user={user} /></td><td className="whitespace-nowrap px-2 py-2.5 text-slate-500">{user.latestActivity ? formatMontrealDate(user.latestActivity, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
          </tr>;
        })}</tbody></table></div>

        {users.rows.length === 0 && <div className="px-5 py-12 text-center"><CircleUserRound className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-bold text-slate-700">Aucun utilisateur trouvé</p><p className="mt-1 text-sm text-slate-500">Modifiez la recherche ou les filtres sélectionnés.</p><Link href="/admin/users" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-cyan-800 hover:bg-cyan-50"><X className="h-4 w-4" />Effacer les filtres</Link></div>}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><p>{from}–{to} sur {total.toLocaleString("fr-CA")} utilisateurs</p><nav aria-label="Pagination" className="flex items-center gap-1"><Link href={href({ page: Math.max(1, page - 1) })} aria-label="Page précédente" aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={`grid h-8 w-8 place-items-center rounded-lg border border-slate-200 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}><ArrowLeft className="h-3.5 w-3.5" /></Link><span aria-current="page" className="grid h-8 min-w-8 place-items-center rounded-lg bg-blue-600 px-2 font-bold text-white">{page} / {pageCount}</span><Link href={href({ page: Math.min(pageCount, page + 1) })} aria-label="Page suivante" aria-disabled={page >= pageCount} tabIndex={page >= pageCount ? -1 : undefined} className={`grid h-8 w-8 place-items-center rounded-lg border border-slate-200 ${page >= pageCount ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}><ArrowRight className="h-3.5 w-3.5" /></Link></nav></footer>
      </section>

      <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Détails de l’utilisateur sélectionné">
        {selected ? <>
          <div className="relative border-b border-slate-100 p-5"><Link href={href({ user: null })} aria-label="Fermer les détails" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><X className="h-4 w-4" /></Link><div className="flex items-center gap-3 pr-7"><Avatar user={selected} large /><div className="min-w-0"><h2 className="truncate font-black">{selected.firstName} {selected.lastName}</h2><p className="mt-1 truncate text-xs text-slate-500">{selected.email}</p></div></div><div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge user={selected} /><RoleBadge role={selected.role} /></div><p className="mt-2 text-[11px] text-slate-500">{selected.latestActivity ? `Dernière activité : ${formatMontrealDate(selected.latestActivity, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Aucune activité enregistrée"}</p></div>
          <div className="space-y-5 p-5">
            <section><h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Informations</h3><div className="mt-2 space-y-2 rounded-xl border border-slate-100 p-3 text-xs"><p className="flex items-center gap-2 text-slate-700"><Mail className="h-4 w-4 shrink-0 text-slate-400" /><span className="break-all">{selected.email}</span></p><p className="flex items-center gap-2 text-slate-600"><CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />Compte créé le {formatMontrealDate(selected.createdAt, { day: "numeric", month: "long", year: "numeric" })}</p><p className="flex items-center gap-2 text-slate-600"><Shield className="h-4 w-4 shrink-0 text-slate-400" />{selected.passwordSetAt ? "Mot de passe configuré" : "Mot de passe à configurer"}</p></div></section>
            <section><h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Club d’affiliation</h3><div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 p-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><Building2 className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-bold">{selected.clubName ?? "Aucun club"}</span><span className="block text-[11px] text-slate-500">{selected.role === "COACH" ? "Club du coach" : "Club associé au compte"}</span></span></div></section>
            <section><h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Statut du compte</h3><div className="mt-2 rounded-xl border border-slate-100 p-3"><StatusBadge user={selected} /><p className="mt-2 text-[11px] leading-4 text-slate-500">{!selected.accessEnabled ? "Ce compte ne peut pas se connecter à DivePlan." : !selected.passwordSetAt ? "Le compte est activé; l’utilisateur doit encore configurer son mot de passe." : "Ce compte peut se connecter à DivePlan."}</p></div></section>
            {selected.role === "COACH" && <div className="space-y-2 border-t border-slate-100 pt-4">
              {clubs.rows.length > 0 && <form action={reassignCoachClub} className="flex gap-2"><input type="hidden" name="userId" value={selected.id} /><input type="hidden" name="returnTo" value="users" /><input type="hidden" name="returnUser" value={selected.id} /><label className="sr-only" htmlFor="selected-coach-club">Club du coach</label><select id="selected-coach-club" name="clubId" defaultValue={selected.clubId ?? ""} required className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="" disabled>Choisir un club</option>{clubs.rows.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select><button className="min-h-10 rounded-lg border px-3 text-xs font-bold hover:bg-slate-50">Changer</button></form>}
              <form action={setCoachAccess}><input type="hidden" name="userId" value={selected.id} /><input type="hidden" name="enabled" value={selected.accessEnabled ? "false" : "true"} /><input type="hidden" name="returnTo" value="users" /><input type="hidden" name="returnUser" value={selected.id} /><button className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border text-xs font-bold focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${selected.accessEnabled ? "border-red-300 text-red-700 hover:bg-red-50" : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"}`}>{selected.accessEnabled ? <><X className="h-4 w-4" />Désactiver le compte</> : <><Check className="h-4 w-4" />Réactiver le compte</>}</button></form>
            </div>}
            {selected.role !== "COACH" && <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Les changements de rôle ou de statut de {roleLabels[selected.role].toLowerCase()} ne sont pas disponibles ici.</p>}
          </div>
        </> : <div className="p-6 text-center text-sm text-slate-500"><CircleUserRound className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold">Sélectionnez un utilisateur</p></div>}
      </aside>
    </div>
  </AdminShell>;
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: "blue" | "green" | "amber" | "violet" }) {
  const tones = { blue: "bg-blue-100 text-blue-700", green: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", violet: "bg-violet-100 text-violet-700" };
  return <div className="flex min-h-[84px] items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[11px] font-semibold text-slate-600">{label}</p><p className="text-xl font-black tabular-nums text-slate-900">{Number(value).toLocaleString("fr-CA")}</p></div></div>;
}

function Avatar({ user, large = false }: { user: Pick<UserRow, "firstName" | "lastName" | "role">; large?: boolean }) {
  const initials = `${user.firstName.slice(0, 1)}${user.lastName.slice(0, 1)}`.toUpperCase();
  const colors = { ADMIN: "bg-violet-50 text-violet-800", COACH: "bg-sky-50 text-sky-800", ATHLETE: "bg-emerald-50 text-emerald-800" };
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full border border-white font-bold shadow-sm ${large ? "h-14 w-14 text-base" : "h-8 w-8 text-[10px]"} ${colors[user.role]}`}>{initials}</span>;
}

function RoleBadge({ role }: { role: UserRow["role"] }) {
  const colors = { ADMIN: "bg-violet-100 text-violet-800", COACH: "bg-blue-100 text-blue-800", ATHLETE: "bg-emerald-100 text-emerald-800" };
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${colors[role]}`}>{roleLabels[role]}</span>;
}

function StatusBadge({ user }: { user: Pick<UserRow, "accessEnabled" | "passwordSetAt"> }) {
  if (!user.accessEnabled) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Désactivé</span>;
  if (!user.passwordSetAt) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />À configurer</span>;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Actif</span>;
}
