import Image from "next/image";
import { CalendarDays, Eye, FileText, Waves } from "lucide-react";
import { updateCoachPreferences } from "@/app/coach/settings/actions";
import { SettingsTabs } from "@/app/coach/settings/settings-tabs";
import { CoachShell } from "@/components/coach/coach-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireFullAccessCoach } from "@/lib/current-user";
import { formatMontrealDate } from "@/lib/timezone";
import { UnsavedChangesBar } from "@/components/ui/unsaved-changes-bar";

export const dynamic = "force-dynamic";

const selectClass = "h-10 w-full rounded-lg border border-[#d5e1ee] bg-white px-3 text-[13px] font-semibold text-[#0b1943] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default async function CoachPrintSettingsPage() {
  const { user } = await requireFullAccessCoach();
  const clubName = user.club?.name ?? "Performance aquatique";
  const logo = user.club?.logo ?? "";
  const preferences = user.coach;
  const sampleDate = formatMontrealDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return <CoachShell active="Reglages">
    <div className="mx-auto max-w-[1600px] pb-24 text-[#0b1943]">
      <header className="mb-3">
        <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#0797c5]">Administration</p>
        <h1 className="mt-1 text-[28px] font-black leading-tight tracking-[-0.03em]">Réglages</h1>
        <p className="mt-0.5 text-[13px] text-[#61718e]">Gérez votre club, votre compte et vos préférences.</p>
      </header>
      <nav aria-label="Sections des réglages" className="mb-5 flex gap-1 overflow-x-auto border-b border-[#d4e0ec]"><SettingsTabs active="print" /></nav>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)]">
        <Card className="rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
          <SectionTitle icon={<FileText />} title="Mise en page" description="Personnalisez l’apparence des feuilles de séance imprimées pour votre club." />
          <form id="print-settings-form" action={updateCoachPreferences} className="mt-4">
            <input type="hidden" name="planningDefaultView" value={preferences?.planningDefaultView ?? "week"} />
            <input type="hidden" name="weekStartsOn" value={String(preferences?.weekStartsOn ?? 1)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-[12px] font-bold">Format papier<select disabled value="letter" className={selectClass}><option value="letter">Lettre</option></select></label>
              <label className="grid gap-1 text-[12px] font-bold">Orientation<select disabled value="portrait" className={selectClass}><option value="portrait">Portrait</option></select></label>
            </div>

            <div className="my-5 border-t border-[#dce7f1]" />
            <h3 className="text-[14px] font-extrabold">Éléments à afficher</h3>
            <p className="mt-0.5 text-[12px] text-[#61718e]">Sélectionnez les informations à inclure dans l’impression des feuilles de séance.</p>
            <fieldset className="mt-3 grid gap-1.5">
              <legend className="sr-only">Éléments de la feuille de séance</legend>
              <FixedPreference checked label="Afficher les dates" hint="La date de séance figure toujours sur la feuille imprimée." />
              <PreferenceCheckbox name="printShowAthleteNames" defaultChecked={preferences?.printShowAthleteNames ?? true} label="Afficher les noms des athlètes" hint="Inclut la liste des athlètes pour chaque séance." />
              <PreferenceCheckbox name="printShowCoachNotes" defaultChecked={preferences?.printShowCoachNotes ?? true} label="Afficher les notes et consignes du coach" hint="Inclut les objectifs, consignes et observations dans la version imprimée." />
              <PreferenceCheckbox name="printRepetitionChecks" defaultChecked={preferences?.printRepetitionChecks ?? false} label="Ajouter une case à cocher pour chaque répétition" hint="Permet de suivre la réalisation des répétitions sur papier." />
            </fieldset>

            <div className="my-5 border-t border-[#dce7f1]" />
            <label className="grid gap-1 text-[12px] font-bold">Taille du texte<select disabled value="standard" className={selectClass}><option value="standard">Standard</option></select></label>
          </form>
        </CardContent></Card>

        <Card className="rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
          <SectionTitle icon={<Eye />} title="Aperçu de la feuille de séance" description="Voici un aperçu de la mise en page avec vos paramètres actuels." />
          <div className="mt-4 rounded-lg border border-[#e0e9f1] bg-white p-4 shadow-[0_3px_12px_rgba(14,52,83,.05)] sm:p-5" aria-label="Aperçu illustratif d’une feuille de séance">
            <div className="flex items-center justify-between gap-3 border-b-2 border-[#718096] pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="relative flex h-14 w-[78px] shrink-0 items-center justify-center">
                  {logo ? <Image src={logo} alt={`Logo ${clubName}`} fill sizes="78px" className="object-contain" /> : <Waves className="h-9 w-9 text-[#ed163d]" />}
                </div>
                <span className="truncate text-[12px] font-black uppercase text-[#0b1943]">{clubName}</span>
              </div>
              <h2 className="text-center text-[clamp(16px,2vw,24px)] font-black tracking-tight">Feuille de séance</h2>
                <div className="hidden text-right text-[10px] leading-4 text-[#61718e] sm:block"><strong className="capitalize text-[#0b1943]">{sampleDate}</strong><br />Centre aquatique</div>
            </div>

            <div className="mt-3 space-y-0.5 rounded-lg bg-[#f0f4fa] px-3 py-2 text-[10px] sm:text-[11px]">
              <p><strong>Groupe :</strong> <span className="ml-2">Avenir</span></p><p><strong>Entraîneur :</strong> <span className="ml-2">Coach</span></p><p><strong>Objectif :</strong> <span className="ml-2">Travail technique</span></p>
            </div>
            <div className="mt-3 overflow-hidden rounded-sm border border-[#d2dbe5]">
              <table className="w-full border-collapse text-left text-[9px] sm:text-[10px]">
                <thead className="bg-[#718096] text-white"><tr><th className="px-2 py-1">#</th><th className="px-2 py-1">Plongeon</th><th className="px-2 py-1">Hauteur</th><th className="px-2 py-1">Répétitions</th>{preferences?.printRepetitionChecks && <th className="px-2 py-1 text-center">✓</th>}</tr></thead>
                <tbody>
                  <PreviewGroup name="Échauffement" colSpan={preferences?.printRepetitionChecks ? 5 : 4} />
                  <PreviewRow index="1" dive="Saut droit" height="1 m" reps="4" showChecks={preferences?.printRepetitionChecks ?? false} />
                  <PreviewRow index="2" dive="Saut groupé" height="1 m" reps="4" showChecks={preferences?.printRepetitionChecks ?? false} />
                  <PreviewRow index="3" dive="Saut carpé" height="3 m" reps="4" showChecks={preferences?.printRepetitionChecks ?? false} />
                  <PreviewGroup name="Série principale" colSpan={preferences?.printRepetitionChecks ? 5 : 4} />
                  <PreviewRow index="4" dive="101C – Saut droit" height="1 m" reps="5" showChecks={preferences?.printRepetitionChecks ?? false} />
                  <PreviewRow index="5" dive="201B – Saut arrière groupé" height="3 m" reps="5" showChecks={preferences?.printRepetitionChecks ?? false} />
                  <PreviewRow index="6" dive="301C – Saut renversé carpé" height="3 m" reps="4" showChecks={preferences?.printRepetitionChecks ?? false} />
                  <PreviewGroup name="Retour au calme" colSpan={preferences?.printRepetitionChecks ? 5 : 4} />
                  <PreviewRow index="7" dive="Saut libre" height="1 m" reps="3" showChecks={preferences?.printRepetitionChecks ?? false} />
                </tbody>
              </table>
            </div>
            {preferences?.printShowCoachNotes !== false && <div className="mt-3 min-h-[56px] rounded-lg bg-[#f0f4fa] p-3 text-[10px] text-[#61718e]"><strong className="text-[#0b1943]">Notes et consignes :</strong><p className="mt-1">Les notes du coach et les consignes de séance apparaîtront ici.</p></div>}
          </div>
        </CardContent></Card>
      </div>

      <UnsavedChangesBar formIds={["print-settings-form"]} resetKey={`${preferences?.printShowAthleteNames}:${preferences?.printShowCoachNotes}:${preferences?.printRepetitionChecks}`} />
    </div>
  </CoachShell>;
}

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-[#102747]">{icon}</span><div><h2 className="text-[17px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h2><p className="mt-0.5 text-[12px] leading-5 text-[#61718e]">{description}</p></div></div>;
}

function FixedPreference({ checked, label, hint }: { checked: boolean; label: string; hint: string }) {
  return <label className="flex min-h-[58px] items-start gap-3 rounded-lg bg-[#f1f6fb] px-3 py-2.5 text-[12px] font-semibold text-[#243753]"><input type="checkbox" checked={checked} disabled aria-label={`${label}, toujours activé`} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600 disabled:opacity-100" /><span>{label}<span className="block text-[11px] font-normal leading-4 text-[#61718e]">{hint}</span></span></label>;
}

function PreferenceCheckbox({ name, defaultChecked, label, hint }: { name: string; defaultChecked: boolean; label: string; hint: string }) {
  return <label className="flex min-h-[58px] items-start gap-3 rounded-lg bg-[#f1f6fb] px-3 py-2.5 text-[12px] font-semibold text-[#243753]"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" /><span>{label}<span className="block text-[11px] font-normal leading-4 text-[#61718e]">{hint}</span></span></label>;
}

function PreviewGroup({ name, colSpan }: { name: string; colSpan: number }) {
  return <tr><th colSpan={colSpan} className="border-t border-[#d2dbe5] bg-[#e8edf3] px-2 py-1 text-[9px] font-extrabold">{name}</th></tr>;
}

function PreviewRow({ index, dive, height, reps, showChecks }: { index: string; dive: string; height: string; reps: string; showChecks: boolean }) {
  return <tr className="border-t border-[#d2dbe5]"><td className="px-2 py-1">{index}</td><td className="px-2 py-1">{dive}</td><td className="px-2 py-1">{height}</td><td className="px-2 py-1">{reps}</td>{showChecks && <td className="px-2 py-1"><div className="flex justify-center gap-1">{Array.from({ length: Number(reps) }, (_, index) => <span key={index} className="h-3.5 w-3.5 rounded-[2px] border border-[#718096]" />)}</div></td>}</tr>;
}
