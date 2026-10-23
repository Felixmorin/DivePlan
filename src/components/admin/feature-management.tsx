"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, BarChart3, CalendarDays, Check, FileText, Info, List, Megaphone, Send, Users, X } from "lucide-react";
import { saveCoachFeatureAudience } from "@/app/admin/actions";

const initialFeatures = [
  { id: "calendar", name: "Calendrier", description: "Gestion des entraînements et événements.", status: "Opérationnelle", enabled: true, icon: CalendarDays },
  { id: "sessions", name: "Séances", description: "Création et suivi des séances.", status: "Opérationnelle", enabled: true, icon: List },
  { id: "simulations", name: "Simulations de compétition", description: "Planification et analyse des simulations.", status: "Opérationnelle", enabled: true, icon: BarChart3 },
  { id: "evaluations", name: "Évaluations", description: "Suivi des progrès et des évaluations.", status: "Désactivée", enabled: false, icon: FileText },
  { id: "planning", name: "Planification annuelle", description: "Planification macro et périodisation.", status: "Dégradée", enabled: false, icon: CalendarDays },
];

export function FeatureManagement({ coaches, excluded }: { coaches: { id: string; name: string }[]; excluded: Record<string, string[]> }) {
  const [features, setFeatures] = useState(initialFeatures);
  const [message, setMessage] = useState("Nous travaillons à rétablir la planification annuelle. Vos données sont conservées.");
  const [audience, setAudience] = useState("Tous les coachs");
  const [duration, setDuration] = useState("24 heures");
  const [previewVisible, setPreviewVisible] = useState(true);
  const [published, setPublished] = useState(false);
  const planning = features.find((feature) => feature.id === "planning")!;
  const toggle = (id: string) => setFeatures((items) => items.map((feature) => feature.id === id ? { ...feature, enabled: !feature.enabled } : feature));

  return <div className="mx-auto max-w-[1440px]">
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_350px]">
      <div className="min-w-0">
        <header className="mb-5"><h1 className="text-3xl font-black tracking-tight text-[#0b214d]">Fonctionnalités</h1><p className="mt-1 text-sm text-slate-600">Contrôlez ce qui est disponible dans l’espace coach.</p></header>

        <section className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Info className="h-5 w-5 fill-current" /></span>
          <div className="min-w-[190px] flex-1"><h2 className="text-sm font-extrabold text-[#0b214d]">1 fonctionnalité affectée</h2><p className="text-xs text-slate-500">Certains coachs rencontrent actuellement des difficultés.</p></div>
          <Megaphone className="h-5 w-5 text-blue-600" /><button type="button" onClick={() => document.getElementById("coach-message")?.focus()} className="min-h-10 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Nouvelle annonce</button>
        </section>

        <section className="mb-3 rounded-xl border border-amber-200 border-l-4 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-[#0b3152]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="text-sm font-extrabold text-[#0b214d]">Planification annuelle</h2><span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800">Dégradée</span></div><p className="mt-1 text-xs leading-5 text-slate-600">Un problème empêche actuellement certains coachs d’utiliser cette fonctionnalité.</p></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="border-slate-200 sm:border-r"><p className="text-[11px] font-medium text-slate-600">Statut global</p><Toggle enabled={planning.enabled} onToggle={() => toggle("planning")} label="Désactivée" /></div>
            <div className="sm:border-r sm:border-slate-200 sm:pl-4"><p className="text-[11px] font-medium text-slate-600">Audience</p><p className="mt-2 flex items-center gap-2 text-xs font-medium"><Users className="h-4 w-4" />Tous les coachs</p></div>
            <div className="sm:pl-4"><p className="text-[11px] font-medium text-slate-600">Données</p><p className="mt-2 flex items-center gap-2 text-xs font-medium"><Activity className="h-4 w-4" />Données conservées <Info className="h-3.5 w-3.5 text-slate-400" /></p></div>
          </div>
          <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => toggle("planning")} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-600 hover:bg-slate-50">Gérer</button><button type="button" onClick={() => document.getElementById("coach-message")?.focus()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-500 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50"><Megaphone className="h-4 w-4" />Publier un bandeau</button></div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Liste des fonctionnalités"><div className="hidden grid-cols-[minmax(190px,1.4fr)_150px_minmax(120px,1fr)_90px] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-600 sm:grid"><span>Fonctionnalité</span><span>Statut</span><span>Audience</span><span className="text-center">Accès global</span></div>
          {features.map(({ id, name, description, status, enabled, icon: Icon }) => <div key={id} className="grid grid-cols-1 gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-[minmax(190px,1.4fr)_150px_minmax(120px,1fr)_90px] sm:items-center sm:gap-3"><div className="flex items-center gap-3"><Icon className="h-5 w-5 shrink-0 text-[#18385c]" /><div><p className="text-xs font-extrabold text-[#0b214d]">{name}</p><p className="text-[10px] text-slate-500">{description}</p></div></div><div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${status === "Opérationnelle" ? "bg-emerald-100 text-emerald-800" : status === "Dégradée" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}><span className={`h-1.5 w-1.5 rounded-full ${status === "Opérationnelle" ? "bg-emerald-600" : status === "Dégradée" ? "bg-amber-600" : "bg-slate-500"}`} />{status}</span></div><AudiencePicker featureId={id} coaches={coaches} excludedIds={excluded[id] ?? []} /><div className="flex items-center justify-between sm:justify-center"><span className="text-[10px] font-medium text-slate-500 sm:hidden">Accès global</span><Toggle enabled={enabled} onToggle={() => toggle(id)} label={enabled ? "Activé" : "Désactivé"} /></div></div>)}
        </section>
      </div>

      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm 2xl:min-h-[580px]">
        <div className="mb-4 flex items-center gap-3"><Megaphone className="h-6 w-6 text-blue-600" /><h2 className="text-base font-black text-[#0b214d]">Bandeau coach</h2></div><p className="-mt-2 mb-4 text-xs text-slate-500">Publiez une annonce dans l’espace coach.</p>
        <label htmlFor="coach-message" className="mb-1.5 block text-xs font-bold text-[#0b214d]">Message <span className="text-red-600">*</span></label><textarea id="coach-message" required maxLength={300} value={message} onChange={(event) => { setMessage(event.target.value); setPublished(false); }} className="min-h-16 w-full resize-y rounded-lg border border-slate-300 p-2.5 text-xs leading-5 text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><div className="mb-4 text-right text-[10px] text-slate-500">{message.length}/300</div>
        <label htmlFor="coach-audience" className="mb-1.5 block text-xs font-bold text-[#0b214d]">Audience <span className="text-red-600">*</span></label><select id="coach-audience" value={audience} onChange={(event) => setAudience(event.target.value)} className="mb-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2.5 text-xs"><option>Tous les coachs</option><option>Coachs affectés</option><option>Coachs du club</option></select><p className="mb-4 text-[10px] text-slate-500">Choisissez les coachs qui verront ce bandeau.</p>
        <label htmlFor="coach-duration" className="mb-1.5 block text-xs font-bold text-[#0b214d]">Durée <span className="text-red-600">*</span></label><select id="coach-duration" value={duration} onChange={(event) => setDuration(event.target.value)} className="mb-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2.5 text-xs"><option>24 heures</option><option>48 heures</option><option>7 jours</option><option>Jusqu’au retrait</option></select><p className="mb-5 text-[10px] leading-4 text-slate-500">Le bandeau sera automatiquement masqué après la durée sélectionnée.</p>
        <p className="mb-2 text-xs font-bold text-[#0b214d]">Aperçu du bandeau</p>{previewVisible && <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[10px] leading-4 text-slate-800"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white"><Info className="h-3.5 w-3.5" /></span><p className="flex-1">{message || "Votre message apparaîtra ici."}</p><button type="button" aria-label="Masquer l’aperçu" onClick={() => setPreviewVisible(false)} className="text-slate-600"><X className="h-3.5 w-3.5" /></button></div>}
        <button type="button" disabled={!message.trim()} onClick={() => setPublished(true)} className="mt-1 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{published ? "Bandeau publié" : "Publier le bandeau"}</button>{published && <p role="status" className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-4 w-4" />Annonce prête à être affichée.</p>}
      </aside>
    </div>
  </div>;
}

function AudiencePicker({ featureId, coaches, excludedIds }: { featureId: string; coaches: { id: string; name: string }[]; excludedIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(excludedIds);
  const [saving, startTransition] = useTransition();
  const router = useRouter();
  const excludedNames = coaches.filter((coach) => selected.includes(coach.id)).map((coach) => coach.name);
  const save = () => startTransition(async () => {
    await saveCoachFeatureAudience(featureId, selected);
    router.refresh();
  });

  return <div className="relative text-xs">
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-h-9 max-w-full items-center gap-2 rounded-md px-1 text-left font-medium text-slate-700 hover:bg-slate-50"><Users className="h-4 w-4 shrink-0" /><span className="truncate">{excludedNames.length ? `${coaches.length - excludedNames.length} coach${coaches.length - excludedNames.length === 1 ? "" : "s"} · ${excludedNames.length} retiré${excludedNames.length === 1 ? "" : "s"}` : "Tous les coachs"}</span></button>
    {open && <div className="absolute left-0 top-10 z-30 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><p className="mb-2 text-xs font-extrabold text-[#0b214d]">Retirer cette fonctionnalité</p><p className="mb-2 text-[10px] text-slate-500">Cochez les coachs qui ne doivent pas y accéder.</p><div className="max-h-48 space-y-1 overflow-y-auto">{coaches.length ? coaches.map((coach) => <label key={coach.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50"><input type="checkbox" checked={selected.includes(coach.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, coach.id] : current.filter((id) => id !== coach.id))} className="accent-blue-600" />{coach.name}</label>) : <p className="px-2 py-2 text-xs text-slate-500">Aucun compte coach.</p>}</div><div className="mt-3 flex items-center justify-between border-t pt-2"><button type="button" onClick={() => setSelected([])} className="text-[10px] font-bold text-slate-600">Effacer</button><button type="button" disabled={saving} onClick={save} className="rounded-md bg-blue-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer"}</button></div></div>}
  </div>;
}

function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return <button type="button" role="switch" aria-checked={enabled} aria-label={label} onClick={onToggle} className={`relative mt-1 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${enabled ? "bg-blue-600" : "bg-slate-400"}`}><span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} /></button>;
}
