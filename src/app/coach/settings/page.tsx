import Image from "next/image";
import { CalendarDays, Check, Globe2, Save, Settings2, Upload, Waves } from "lucide-react";
import { updateClubSettings, updateCoachPreferences } from "@/app/coach/settings/actions";
import { CoachShell } from "@/components/coach/coach-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireFullAccessCoach } from "@/lib/current-user";
import { SettingsTabs } from "@/app/coach/settings/settings-tabs";

export const dynamic = "force-dynamic";

const fieldClass = "h-9 rounded-lg border-[#d5e1ee] bg-white px-3 text-[13px] font-medium text-[#0b1943] shadow-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const selectClass = "h-9 w-full rounded-lg border border-[#d5e1ee] bg-white px-3 text-[13px] font-semibold text-[#0b1943] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default async function CoachSettingsPage() {
  const { user } = await requireFullAccessCoach();
  const clubName = user.club?.name ?? "Performance aquatique";
  const logo = user.club?.logo ?? "";

  return (
    <CoachShell active="Reglages">
      <div className="settings-page mx-auto max-w-[1600px] pb-24 text-[#0b1943]">
        <header className="mb-3">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#0797c5]">Administration</p>
          <h1 className="mt-1 text-[28px] font-black leading-tight tracking-[-0.03em]">Réglages</h1>
          <p className="mt-0.5 text-[13px] text-[#61718e]">Gérez votre club, votre compte et vos préférences.</p>
        </header>

        <nav aria-label="Sections des réglages" className="mb-5 flex gap-1 overflow-x-auto border-b border-[#d4e0ec]">
          <SettingsTabs active="club" />
        </nav>

        <div className="grid gap-4">
          <Card id="club" className="scroll-mt-24 rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]">
            <CardContent className="p-5">
              <SectionTitle icon={<CalendarDays />} title="Identité du club" description="Ces informations apparaissent dans le coin supérieur gauche du portail coach." />
              <form id="club-settings-form" action={updateClubSettings} className="mt-3 grid gap-3">
                <label className="grid gap-1 text-[12px] font-bold">Nom affiché du club<Input className={fieldClass} name="name" defaultValue={clubName} required minLength={2} maxLength={80} placeholder="Performance aquatique" /></label>
                <fieldset>
                  <legend className="mb-1 text-[12px] font-bold">Logo du club</legend>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex h-[74px] w-[112px] items-center justify-center overflow-hidden rounded-lg border border-[#dce7f1] bg-white">
                      {logo ? <Image src={logo} alt={`Logo ${clubName}`} fill sizes="112px" className="object-contain p-2" /> : <Waves className="h-8 w-8 text-[#0797b1]" />}
                    </div>
                    <div className="min-w-[220px] flex-1">
                      <label className="flex h-10 cursor-text items-center gap-2 rounded-lg border border-[#ff6b57] px-3 text-[13px] font-bold text-[#e6382b]" htmlFor="club-logo"><Upload className="h-4 w-4" /> Remplacer le logo</label>
                      <Input id="club-logo" name="logo" defaultValue={logo} className={`${fieldClass} mt-2`} placeholder="URL du logo (PNG ou JPG)" />
                      <p className="mt-1 text-[11px] text-[#61718e]">PNG ou JPG · Jusqu’à 5 Mo · URL sécurisée ou chemin /logo.png</p>
                    </div>
                  </div>
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-[12px] font-bold">Ville<Input className={fieldClass} disabled placeholder="Ville du club" /></label>
                  <label className="grid gap-1 text-[12px] font-bold">Piscine<Input className={fieldClass} disabled placeholder="Centre aquatique" /></label>
                </div>
                <div className="flex justify-end"><Button type="submit" variant="action" className="h-10 min-h-10 rounded-lg px-5"><Save className="h-4 w-4" /> Enregistrer le club</Button></div>
              </form>
            </CardContent>
          </Card>

        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1fr)]">
          <Card className="rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
            <SectionTitle icon={<Globe2 />} title="Préférences régionales" description="Définissez les réglages régionaux pour votre club." />
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_230px]">
              <label className="grid gap-1 text-[12px] font-bold">Fuseau horaire<select disabled value="America/Toronto" className={selectClass}><option value="America/Toronto">Montréal (UTC−04:00)</option></select></label>
              <fieldset><legend className="mb-1 text-[12px] font-bold">Format de l’heure</legend><div className="flex h-9 rounded-lg bg-[#edf3f9] p-0.5 text-[13px] font-bold"><span className="flex flex-1 items-center justify-center rounded-md text-[#41516e]">12 h</span><span className="flex flex-1 items-center justify-center rounded-md border border-blue-500 bg-white text-blue-600 shadow-sm">24 h</span></div></fieldset>
            </div>
          </CardContent></Card>

          <Card id="planning" className="scroll-mt-24 rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
            <SectionTitle icon={<CalendarDays />} title="Préférences du calendrier" description="Personnalisez l’affichage du calendrier et la durée par défaut des séances." />
            <form action={updateCoachPreferences} className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-[12px] font-bold">Vue par défaut<select name="planningDefaultView" defaultValue={user.coach?.planningDefaultView ?? "week"} className={selectClass}><option value="week">Semaine</option><option value="month">Mois</option></select></label>
              <label className="grid gap-1 text-[12px] font-bold">Premier jour de la semaine<select name="weekStartsOn" defaultValue={String(user.coach?.weekStartsOn ?? 1)} className={selectClass}><option value="1">Lundi</option><option value="0">Dimanche</option></select></label>
              <label className="grid gap-1 text-[12px] font-bold">Durée de séance par défaut<select disabled value="60" className={selectClass}><option value="60">60 minutes</option></select></label>
              <div className="sm:col-span-3 flex justify-end"><Button type="submit" variant="action" className="h-10 min-h-10 rounded-lg px-5"><Save className="h-4 w-4" /> Enregistrer le planning</Button></div>
            </form>
          </CardContent></Card>
        </div>

        <div className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-[1570px] flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9f2e5] bg-[#f5fff9]/95 px-4 py-2.5 shadow-[0_8px_28px_rgba(8,70,45,.12)] backdrop-blur sm:inset-x-[calc(17rem+1.5rem)]">
          <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#13a568] text-white"><Check className="h-5 w-5" /></span><div><p className="text-[13px] font-extrabold text-[#07864e]">Réglages de votre club</p><p className="text-[11px] text-[#61718e]">Enregistrez chaque section avec son bouton.</p></div></div>
          <button type="submit" form="club-settings-form" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#ff604c] px-5 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#e64f3d]"><Settings2 className="h-4 w-4" /> Enregistrer le club</button>
        </div>
      </div>
    </CoachShell>
  );
}

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-[#102747]">{icon}</span><div><h2 className="text-[17px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h2><p className="mt-0.5 text-[12px] leading-5 text-[#61718e]">{description}</p></div></div>;
}
