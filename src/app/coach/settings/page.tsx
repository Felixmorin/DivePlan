import Image from "next/image";
import { Bell, CalendarDays, Check, FileText, Globe2, LogOut, Save, Settings2, Shield, Upload, UserRound, Waves } from "lucide-react";
import { signOutCoach, updateClubSettings, updateCoachAccount, updateCoachPreferences } from "@/app/coach/settings/actions";
import { CoachShell } from "@/components/coach/coach-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireFullAccessCoach } from "@/lib/current-user";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { SignOutWithPushCleanup } from "@/components/notifications/sign-out-with-push-cleanup";

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
          <Tab href="#club" icon={<UserRound />} active>Club</Tab>
          <Tab href="#compte" icon={<Shield />}>Compte</Tab>
          <Tab href="#notifications" icon={<Bell />}>Notifications</Tab>
          <Tab href="#planning" icon={<CalendarDays />}>Planning</Tab>
          <Tab href="#feuille" icon={<FileText />}>Feuille de séance</Tab>
        </nav>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(370px,.9fr)]">
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

          <div className="grid content-start gap-4">
            <div id="notifications" className="scroll-mt-24"><NotificationSettings /></div>
            <Card className="rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]">
              <CardContent className="p-4">
                <h2 className="mb-2 text-[14px] font-extrabold">Aperçu dans l’application</h2>
                <div className="flex items-center gap-3 rounded-xl bg-[#071827] p-3 text-white">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                    {logo ? <Image src={logo} alt={`Logo ${clubName}`} fill sizes="48px" className="object-contain p-1" /> : <Waves className="h-6 w-6 text-[#0797b1]" />}
                  </div><div><p className="text-lg font-black leading-tight">DivePlan</p><p className="text-xs font-semibold uppercase text-white/65">{clubName}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
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

        <Card id="feuille" className="mt-4 scroll-mt-24 rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,.8fr)]">
            <div>
              <SectionTitle icon={<FileText />} title="Impression des séances" description="Choisissez les informations à inclure lors de l’impression des feuilles de séance." />
              <form action={updateCoachPreferences} className="mt-3 grid gap-3 lg:grid-cols-[180px_180px_minmax(240px,1fr)]">
                <input type="hidden" name="planningDefaultView" value={user.coach?.planningDefaultView ?? "week"} />
                <input type="hidden" name="weekStartsOn" value={String(user.coach?.weekStartsOn ?? 1)} />
                <label className="grid content-start gap-1 text-[12px] font-bold">Format papier<select disabled value="letter" className={selectClass}><option value="letter">Lettre</option></select></label>
                <label className="grid content-start gap-1 text-[12px] font-bold">Orientation<select disabled value="portrait" className={selectClass}><option value="portrait">Portrait</option></select></label>
                <fieldset className="grid gap-1">
                  <legend className="sr-only">Contenu de la feuille imprimée</legend>
                  <PreferenceCheckbox name="printShowCoachNotes" defaultChecked={user.coach?.printShowCoachNotes ?? true} label="Afficher les notes et consignes du coach" hint="Inclut les objectifs, consignes et observations dans la version imprimée." />
                  <PreferenceCheckbox name="printShowAthleteNames" defaultChecked={user.coach?.printShowAthleteNames ?? true} label="Afficher les noms des athlètes" hint="Inclut la liste des athlètes pour chaque séance." />
                  <PreferenceCheckbox name="printRepetitionChecks" defaultChecked={user.coach?.printRepetitionChecks ?? false} label="Ajouter une case à cocher pour chaque répétition" hint="Permet de suivre la réalisation des répétitions sur papier." />
                </fieldset>
                <div className="lg:col-span-3 flex justify-end"><Button type="submit" variant="action" className="h-10 min-h-10 rounded-lg px-5"><Save className="h-4 w-4" /> Enregistrer les préférences</Button></div>
              </form>
            </div>
            <div className="min-h-[176px] rounded-lg border border-[#e0e9f1] bg-[#fbfdff] p-4">
              <div className="flex items-start justify-between"><div className="font-black uppercase text-[#ed163d]">{clubName}</div><div className="text-sm font-extrabold">Feuille de séance</div></div>
              <div className="mt-4 grid grid-cols-4 border-l border-t border-[#d9e1e9] text-[10px] text-[#69778b]"><span className="col-span-2 border-b border-r p-2">Athlète</span><span className="border-b border-r p-2">Plongeon</span><span className="border-b border-r p-2">Notes</span>{Array.from({length:8},(_,i)=><span key={i} className="h-7 border-b border-r" />)}</div>
            </div>
          </div>
        </CardContent></Card>

        <Card id="compte" className="mt-4 scroll-mt-24 rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
          <SectionTitle icon={<Shield />} title="Compte coach" description="Modifiez les informations utilisées pour vous connecter." />
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <form action={updateCoachAccount} className="contents">
              <label className="grid gap-1 text-[12px] font-bold">Courriel<Input className={fieldClass} name="email" type="email" defaultValue={user.email} autoComplete="email" required maxLength={254} /></label>
              <label className="grid gap-1 text-[12px] font-bold">Nom d’utilisateur<Input className={fieldClass} name="username" defaultValue={user.username ?? ""} autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9._\\x2d]+" placeholder="ex. felix.lavoie" /></label>
              <Button type="submit" variant="action" className="h-10 min-h-10 rounded-lg px-5"><Save className="h-4 w-4" /> Enregistrer le compte</Button>
            </form>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#f3f7fb] px-3 py-2"><span className="flex items-center gap-2 text-sm font-bold"><Shield className="h-4 w-4" /> Session active</span><span className="rounded-full bg-[#e3f7ec] px-3 py-1 text-xs font-bold text-[#07864e]">Coach</span><SignOutWithPushCleanup action={signOutCoach}><Button type="submit" variant="outline" className="h-9 min-h-9"><LogOut className="h-4 w-4" /> Me déconnecter</Button></SignOutWithPushCleanup></div>
        </CardContent></Card>

        <div className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-[1570px] flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9f2e5] bg-[#f5fff9]/95 px-4 py-2.5 shadow-[0_8px_28px_rgba(8,70,45,.12)] backdrop-blur sm:inset-x-[calc(17rem+1.5rem)]">
          <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#13a568] text-white"><Check className="h-5 w-5" /></span><div><p className="text-[13px] font-extrabold text-[#07864e]">Réglages de votre club</p><p className="text-[11px] text-[#61718e]">Enregistrez chaque section avec son bouton.</p></div></div>
          <button type="submit" form="club-settings-form" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#ff604c] px-5 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#e64f3d]"><Settings2 className="h-4 w-4" /> Enregistrer le club</button>
        </div>
      </div>
    </CoachShell>
  );
}

function Tab({ href, icon, children, active = false }: { href: string; icon: React.ReactNode; children: React.ReactNode; active?: boolean }) {
  return <a href={href} className={`flex min-h-11 shrink-0 items-center gap-2 border-b-[3px] px-5 text-[13px] font-bold ${active ? "border-[#ff604c] bg-[#fff2f1] text-[#e6382b]" : "border-transparent text-[#263755] hover:bg-white/70"}`}>{icon}{children}</a>;
}

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-[#102747]">{icon}</span><div><h2 className="text-[17px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h2><p className="mt-0.5 text-[12px] leading-5 text-[#61718e]">{description}</p></div></div>;
}

function PreferenceCheckbox({ name, defaultChecked, label, hint }: { name: string; defaultChecked: boolean; label: string; hint: string }) {
  return <label className="flex min-h-10 items-start gap-2 rounded-lg bg-[#f1f6fb] px-2.5 py-1.5 text-[11px] font-semibold text-[#243753]"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" /><span>{label}<span className="block text-[10px] font-normal leading-4 text-[#61718e]">{hint}</span></span></label>;
}
