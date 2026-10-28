import { headers } from "next/headers";
import { Laptop, LockKeyhole, LogOut, Pencil, Shield, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { updateCoachAccount, signOutCoach } from "@/app/coach/settings/actions";
import { CoachPasswordForm } from "@/app/coach/settings/coach-password-form";
import { SettingsTabs } from "@/app/coach/settings/settings-tabs";
import { CoachShell } from "@/components/coach/coach-shell";
import { SignOutWithPushCleanup } from "@/components/notifications/sign-out-with-push-cleanup";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireFullAccessCoach } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const fieldClass = "h-10 rounded-lg border-[#d5e1ee] bg-white px-3 text-[13px] font-medium text-[#0b1943] shadow-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default async function CoachAccountSettingsPage() {
  const { user } = await requireFullAccessCoach();
  const requestHeaders = await headers();
  const agent = requestHeaders.get("user-agent") ?? "Navigateur actuel";
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(agent);
  const DeviceIcon = isMobile ? Smartphone : Laptop;
  const browser = /Edg\//.test(agent) ? "Microsoft Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Navigateur";
  const platform = /Windows/i.test(agent) ? "Windows" : /Macintosh|Mac OS/i.test(agent) ? "macOS" : /iPhone|iPad|iPod/i.test(agent) ? "iOS" : /Android/i.test(agent) ? "Android" : /Linux/i.test(agent) ? "Linux" : "cet appareil";
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toLocaleUpperCase("fr-CA");

  return <CoachShell active="Reglages">
    <div className="mx-auto max-w-[1600px] pb-24 text-[#0b1943]">
      <header className="mb-3">
        <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#0797c5]">Administration</p>
        <h1 className="mt-1 text-[28px] font-black leading-tight tracking-[-0.03em]">Réglages</h1>
        <p className="mt-0.5 text-[13px] text-[#61718e]">Gérez votre club, votre compte et vos préférences.</p>
      </header>
      <nav aria-label="Sections des réglages" className="mb-5 flex gap-1 overflow-x-auto border-b border-[#d4e0ec]"><SettingsTabs active="account" /></nav>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(370px,.9fr)]">
        <div className="grid content-start gap-4">
          <Card className="rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
            <SectionTitle icon={<UserRound />} title="Profil du coach" description="Ces informations apparaissent sur votre compte et sont utilisées dans l’application." />
            <form id="account-settings-form" action={updateCoachAccount} className="mt-4 grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
              <div className="flex flex-col items-center gap-3 sm:pt-1">
                <div aria-label={`Initiales de ${user.firstName} ${user.lastName}`} className="flex h-[108px] w-[108px] items-center justify-center rounded-full bg-[#e8eaff] text-[34px] font-bold text-[#101b35]">{initials}</div>
                <p className="text-center text-[11px] text-[#61718e]">Photo de profil non configurée</p>
              </div>
              <div className="grid content-start gap-3">
                <label className="grid gap-1 text-[12px] font-bold">Nom complet<Input className={fieldClass} value={`${user.firstName} ${user.lastName}`} readOnly aria-readonly="true" /></label>
                <label className="grid gap-1 text-[12px] font-bold">Nom d’utilisateur<Input className={fieldClass} name="username" defaultValue={user.username ?? ""} autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9._\\x2d]+" placeholder="ex. felix.morin" /></label>
                <p className="-mt-2 text-[11px] text-[#61718e]">Ce nom est visible par les autres coachs et les athlètes.</p>
                <label className="grid gap-1 text-[12px] font-bold">Courriel<Input className={fieldClass} name="email" type="email" defaultValue={user.email} autoComplete="email" required maxLength={254} /></label>
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-[#61718e]">Utilisé pour vous connecter à DivePlan.</p><Button type="submit" variant="outline" form="account-settings-form" className="h-10 min-h-10 rounded-lg"><Pencil className="h-4 w-4" /> Enregistrer le profil</Button></div>
              </div>
            </form>
          </CardContent></Card>

          <Card className="rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
            <SectionTitle icon={<LockKeyhole />} title="Sécurité" description="Gérez votre mot de passe et les options de sécurité de votre compte." />
            <CoachPasswordForm />
            <div className="my-4 border-t border-[#e1e9f1]" />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div><h3 className="text-[13px] font-extrabold">Authentification à deux facteurs (2FA)</h3><p className="mt-1 text-[12px] leading-5 text-[#61718e]">L’authentification à deux facteurs n’est pas encore disponible pour les comptes coach.</p></div>
              <div className="flex min-h-12 items-center gap-2 rounded-lg bg-[#f1f6fb] px-3 text-[12px] font-bold text-[#61718e]"><ShieldCheck className="h-5 w-5" /> Non configurée</div>
            </div>
          </CardContent></Card>
        </div>

        <div className="grid content-start gap-4">
          <Card className="rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
            <SectionTitle icon={<Shield />} title="Rôle et accès" description="Votre rôle détermine vos permissions dans l’application." />
            <div className="mt-4 flex items-center gap-4 rounded-xl bg-[#f2f6fc] p-4 sm:p-5"><UserRound className="h-11 w-11 shrink-0 text-[#ed163d]" /><div><h3 className="text-[16px] font-extrabold">Coach</h3><p className="mt-1 text-[12px] leading-5 text-[#61718e]">Vous pouvez planifier des séances, gérer les athlètes, consulter les statistiques et accéder aux outils d’entraînement de votre club.</p></div></div>
          </CardContent></Card>

          <Card className="rounded-xl border-[#dce7f1] shadow-[0_6px_20px_rgba(14,52,83,.05)]"><CardContent className="p-5">
            <SectionTitle icon={<Laptop />} title="Session active" description="Appareil utilisé pour cette session DivePlan." />
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#e0e9f1] bg-white p-3">
              <DeviceIcon className="h-6 w-6 shrink-0 text-blue-600" />
              <div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold">{isMobile ? "Mobile" : "Cet appareil"} · {browser} sur {platform}</p><p className="mt-1 truncate text-[11px] text-[#61718e]">Session actuelle</p></div>
              <span className="shrink-0 rounded-full bg-[#d7f7ed] px-2.5 py-1 text-[10px] font-bold text-[#07864e]">Active</span>
            </div>
            <SignOutWithPushCleanup action={signOutCoach} className="mt-4 block">
              <Button type="submit" variant="outline" className="h-10 min-h-10 w-full rounded-lg border-[#ff604c] text-[#e6382b] hover:bg-[#fff2f1]"><LogOut className="h-4 w-4" /> Me déconnecter</Button>
            </SignOutWithPushCleanup>
            <p className="mt-2 text-center text-[11px] text-[#61718e]">La gestion des appareils connectés n’est pas encore disponible.</p>
          </CardContent></Card>
        </div>
      </div>

      <div className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-[1570px] flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9f2e5] bg-[#f5fff9]/95 px-4 py-2.5 shadow-[0_8px_28px_rgba(8,70,45,.12)] backdrop-blur sm:inset-x-[calc(17rem+1.5rem)]">
        <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#13a568] text-white"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-[13px] font-extrabold text-[#07864e]">Profil du coach</p><p className="text-[11px] text-[#61718e]">Enregistrez le nom d’utilisateur et le courriel.</p></div></div>
        <Button type="submit" form="account-settings-form" variant="action" className="h-10 min-h-10 rounded-lg px-5"><Pencil className="h-4 w-4" /> Enregistrer les modifications</Button>
      </div>
    </div>
  </CoachShell>;
}

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-[#102747]">{icon}</span><div><h2 className="text-[17px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h2><p className="mt-0.5 text-[12px] leading-5 text-[#61718e]">{description}</p></div></div>;
}
