import { SettingsTabs } from "@/app/coach/settings/settings-tabs";
import { CoachShell } from "@/components/coach/coach-shell";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { requireFullAccessCoach } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function CoachNotificationSettingsPage() {
  const { user } = await requireFullAccessCoach();
  return <CoachShell active="Reglages">
    <div className="mx-auto max-w-[1600px] pb-24 text-[#0b1943]">
      <header className="mb-3">
        <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#0797c5]">Administration</p>
        <h1 className="mt-1 text-[28px] font-black leading-tight tracking-[-0.03em]">Réglages</h1>
        <p className="mt-0.5 text-[13px] text-[#61718e]">Gérez votre club, votre compte et vos préférences.</p>
      </header>
      <nav aria-label="Sections des réglages" className="mb-5 flex gap-1 overflow-x-auto border-b border-[#d4e0ec]"><SettingsTabs active="notifications" /></nav>
      <NotificationSettings variant="page" clubName={user.club?.name ?? "DivePlan"} />
    </div>
  </CoachShell>;
}
