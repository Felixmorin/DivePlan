import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/current-user";
import { query } from "@/lib/db";
import Link from "next/link";
import { createCoachAccount, reassignCoachClub, setCoachAccess } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

type CoachRow = { id: string; firstName: string; lastName: string; email: string; clubId: string | null; clubName: string | null; accessEnabled: boolean; createdAt: Date };
type ClubRow = { id: string; name: string };

export default async function AdminCoachesPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string; updated?: string; status?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const disabledOnly = params.status === "disabled";
  const [coaches, clubs, counts] = await Promise.all([
    query<CoachRow>(`SELECT u.id, u."firstName", u."lastName", u.email, u."clubId", c.name AS "clubName", u."accessEnabled", u."createdAt" FROM "User" u LEFT JOIN "Club" c ON c.id = u."clubId" WHERE u.role = 'COACH' AND ($1::boolean = false OR NOT u."accessEnabled") ORDER BY u."accessEnabled" DESC, u."lastName", u."firstName"`, [disabledOnly]),
    query<ClubRow>(`SELECT id, name FROM "Club" ORDER BY name`),
    query<{ total: string; disabled: string }>(`SELECT count(*)::text AS total, count(*) FILTER (WHERE NOT "accessEnabled")::text AS disabled FROM "User" WHERE role = 'COACH'`)
  ]);
  const errors: Record<string, string> = { invalid: "Vérifiez les champs : mot de passe temporaire de 10 caractères minimum.", club: "Le club choisi n’existe plus.", exists: "Un compte utilise déjà ce courriel.", "not-found": "Ce compte coach n’existe plus." };
  return <AdminShell active="Accès coach">
    <header className="mb-5"><h1 className="text-3xl font-black tracking-tight">Accès coach</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">Les coachs désactivés ne peuvent plus se connecter. Leur historique reste associé à leur compte.</p></header>
    {params.error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{errors[params.error] ?? "La demande n’a pas pu être traitée."}</p>}
    {params.created && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Compte créé. Le coach doit choisir son mot de passe à sa première connexion.</p>}
    {params.updated && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Les accès ont été mis à jour.</p>}
    <section className="mb-5 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Créer un compte coach</h2>
      {clubs.rows.length ? <form action={createCoachAccount} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Prénom<input name="firstName" required maxLength={80} className="rounded-lg border px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">Nom<input name="lastName" required maxLength={80} className="rounded-lg border px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">Courriel<input type="email" name="email" required maxLength={254} className="rounded-lg border px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">Club<select name="clubId" required className="rounded-lg border bg-white px-3 py-2 font-normal">{clubs.rows.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Mot de passe temporaire<input name="temporaryPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required className="rounded-lg border px-3 py-2 font-normal" /><span className="text-xs font-normal text-[var(--color-ink-muted)]">Le coach devra en choisir un nouveau à sa première connexion.</span></label>
        <button className="w-fit rounded-xl bg-[var(--color-navy)] px-4 py-2.5 text-sm font-bold text-white sm:col-span-2">Créer l’accès coach</button>
      </form> : <p className="mt-2 text-sm text-amber-800">Créez un club avant d’ajouter des coachs.</p>}
    </section>
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black">{disabledOnly ? "Comptes désactivés" : "Comptes existants"} <span className="ml-1 text-sm font-semibold text-[var(--color-ink-muted)]">({coaches.rows.length})</span></h2><nav aria-label="Filtrer les comptes coach" className="flex flex-wrap gap-2 text-sm"><Link href="/admin/coaches" aria-current={!disabledOnly ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-3 font-semibold focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${!disabledOnly ? "border-[var(--color-navy)] bg-slate-50 text-[var(--color-ink)]" : "hover:bg-slate-50"}`}>Tous ({counts.rows[0]?.total ?? "0"})</Link><Link href="/admin/coaches?status=disabled" aria-current={disabledOnly ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-3 font-semibold focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${disabledOnly ? "border-[var(--color-navy)] bg-slate-50 text-[var(--color-ink)]" : "hover:bg-slate-50"}`}>Désactivés ({counts.rows[0]?.disabled ?? "0"})</Link></nav></div></div>
      {coaches.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Coach</th><th className="px-4 py-3">Club</th><th className="px-4 py-3">État</th><th className="px-4 py-3">Accès</th></tr></thead><tbody>{coaches.rows.map((coach) => <tr key={coach.id} className="border-t"><td className="px-4 py-3"><p className="font-bold">{coach.firstName} {coach.lastName}</p><p className="text-xs text-[var(--color-ink-muted)]">{coach.email}</p></td><td className="px-4 py-3">{clubs.rows.length ? <form action={reassignCoachClub} className="flex items-center gap-2"><input type="hidden" name="userId" value={coach.id} /><select name="clubId" defaultValue={coach.clubId ?? ""} required className="max-w-48 rounded-lg border bg-white px-2 py-2 text-xs">{clubs.rows.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select><button className="rounded-lg border px-2.5 py-2 text-xs font-bold hover:bg-slate-50">Changer</button></form> : coach.clubName ?? "Aucun club"}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${coach.accessEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{coach.accessEnabled ? "Actif" : "Désactivé"}</span></td><td className="px-4 py-3"><form action={setCoachAccess}><input type="hidden" name="userId" value={coach.id} /><input type="hidden" name="enabled" value={coach.accessEnabled ? "false" : "true"} /><button className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-50">{coach.accessEnabled ? "Désactiver" : "Réactiver"}</button></form></td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-[var(--color-ink-muted)]">Aucun compte coach.</p>}
    </section>
  </AdminShell>;
}
