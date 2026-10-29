"use client";

import { useState, useTransition } from "react";
import { updateAdminUser } from "./user-actions";

type User = { id: string; firstName: string; lastName: string; email: string; role: "ADMIN" | "COACH" | "ATHLETE"; clubId: string | null; clubName: string | null; accessEnabled: boolean; passwordSetAt: string | null; createdAt: string; latestActivity: string | null };
type Club = { id: string; name: string };

export function UserDetails({ user, clubs, events }: { user: User; clubs: Club[]; events: { id: string; message: string; createdAt: string; fields: string[] }[] }) {
  const [draft, setDraft] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email, clubId: user.clubId ?? "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = draft.firstName !== user.firstName || draft.lastName !== user.lastName || draft.email !== user.email || draft.clubId !== (user.clubId ?? "");
  function save(form: FormData) {
    setError(""); setSuccess(false);
    startTransition(async () => {
      const result = await updateAdminUser(user.id, Object.fromEntries(form) as Record<string, string>);
      if (!result.ok) setError(result.error);
      else { setSuccess(true); window.location.reload(); }
    });
  }
  function access(enabled: boolean) {
    setError(""); startTransition(async () => { const result = await updateAdminUser(user.id, { accessEnabled: String(enabled) }); if (!result.ok) setError(result.error); else window.location.reload(); });
  }
  return <aside className="max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm motion-safe:animate-[user-panel-in_220ms_ease-out] max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:max-h-screen max-lg:rounded-none" aria-label="Détails de l’utilisateur sélectionné">
    <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 p-4 backdrop-blur"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate font-black">{user.firstName} {user.lastName}</h2><p className="truncate text-xs text-slate-500">{user.email}</p></div><a href="/admin/users?user=none" aria-label="Fermer les détails" className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100">×</a></div><p className="mt-2 text-xs">{user.role} · {user.clubName ?? "Aucun club"} · {user.accessEnabled ? "Accès actif" : "Désactivé"}</p></header>
    <div className="space-y-5 p-4 text-sm">
      <section><h3 className="font-black">Diagnostic du compte</h3><dl className="mt-2 grid gap-2 text-xs"><div><dt className="font-bold">Confirmation du courriel</dt><dd>Donnée indisponible</dd></div><div><dt className="font-bold">Complétude du profil</dt><dd>{user.firstName && user.lastName ? "Nom complet renseigné" : "Donnée indisponible"}</dd></div><div><dt className="font-bold">Connexion récente</dt><dd>{user.latestActivity ? new Date(user.latestActivity).toLocaleString("fr-CA") : "Donnée indisponible"}</dd></div><div><dt className="font-bold">Mot de passe</dt><dd>{user.passwordSetAt ? "Configuré" : "À configurer"}</dd></div></dl></section>
      <section><h3 className="font-black">Modifier le profil</h3><form action={save} className="mt-2 space-y-2">
        <label className="block text-xs">Prénom<input name="firstName" value={draft.firstName} onChange={e => setDraft({...draft, firstName:e.target.value})} maxLength={80} required className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
        <label className="block text-xs">Nom<input name="lastName" value={draft.lastName} onChange={e => setDraft({...draft, lastName:e.target.value})} maxLength={80} required className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
        <label className="block text-xs">Courriel<input type="email" name="email" value={draft.email} onChange={e => setDraft({...draft, email:e.target.value})} maxLength={254} required className="mt-1 h-10 w-full rounded-lg border px-3" /></label>
        <label className="block text-xs">Club<select name="clubId" value={draft.clubId} onChange={e => setDraft({...draft, clubId:e.target.value})} className="mt-1 h-10 w-full rounded-lg border px-3"><option value="">Aucun club</option>{clubs.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button disabled={!dirty || pending} className="min-h-10 w-full rounded-lg bg-blue-700 px-3 font-bold text-white disabled:opacity-40">{pending ? "Enregistrement…" : "Enregistrer les modifications"}</button>
      </form><p aria-live="polite" className="mt-2 text-xs">{error || (success ? "Modifications enregistrées" : "")}</p><p className="mt-1 text-xs text-slate-500">Rôle : {user.role}. Modification du rôle indisponible, car les comptes coach et athlète ont des données liées.</p></section>
      <section><h3 className="font-black">Actions de dépannage</h3><p className="mt-2 text-xs text-slate-600">Courriel de configuration et réinitialisation sécurisée du mot de passe : non disponibles dans l’application.</p><p className="mt-1 text-xs text-slate-600">Correction automatique : aucune règle de correction vérifiable n’est définie.</p></section>
      <section><h3 className="font-black">Historique admin</h3>{events.length ? <ul className="mt-2 space-y-2 text-xs">{events.map(e=><li key={e.id} className="border-l-2 border-blue-300 pl-2">{new Date(e.createdAt).toLocaleString("fr-CA")} · {e.message} · Champs : {e.fields.join(", ")}</li>)}</ul> : <p className="mt-2 text-xs text-slate-500">Aucun changement administratif journalisé pour ce compte.</p>}</section>
      <section className="rounded-xl border border-red-200 bg-red-50 p-3"><h3 className="font-black text-red-800">Accès au compte</h3><p className="my-2 text-xs">La désactivation bloque les prochaines connexions. Une session déjà ouverte n’est pas révoquée. Les séances existantes ne sont pas supprimées.</p>{confirmDisable ? <div className="flex gap-2"><button onClick={()=>setConfirmDisable(false)} className="rounded-lg border px-3 py-2">Annuler</button><button disabled={pending} onClick={()=>access(false)} className="rounded-lg bg-red-700 px-3 py-2 font-bold text-white">{pending ? "Désactivation…" : "Confirmer la désactivation"}</button></div> : <button disabled={pending} onClick={()=>user.accessEnabled ? setConfirmDisable(true) : access(true)} className="rounded-lg bg-red-700 px-3 py-2 font-bold text-white">{user.accessEnabled ? "Désactiver le compte" : "Réactiver le compte"}</button>}</section>
    </div>
  </aside>;
}
