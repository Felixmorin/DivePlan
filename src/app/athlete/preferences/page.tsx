import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CircleHelp, LogOut, Shield } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { SignOutWithPushCleanup } from "@/components/notifications/sign-out-with-push-cleanup";
import { signOutAthlete } from "@/app/athlete/profile/actions";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { AppearanceSetting } from "@/components/athlete/appearance-setting";

export const dynamic = "force-dynamic";

export default async function AthletePreferencesPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");

  return <AthleteShell hideNav className="athlete-preferences-page">
    <header className="athlete-preferences-header"><Link href="/athlete/profile" aria-label="Retour au profil"><ArrowLeft /></Link><h1>Préférences</h1></header>
    <section className="preference-group">
      <h2>Notifications</h2>
      <div className="preference-notifications"><NotificationSettings /></div>
    </section>
    <section className="preference-group">
      <h2>Application</h2><div className="preference-rows">
        <AppearanceSetting />
      </div>
    </section>
    <section className="preference-group">
      <h2>Compte</h2><div className="preference-rows">
        <button type="button" disabled className="preference-row preference-disabled"><span className="preference-icon blue"><Shield /></span><strong>Confidentialité</strong><span className="preference-chevron">›</span></button>
        <button type="button" disabled className="preference-row preference-disabled"><span className="preference-icon mint"><CircleHelp /></span><strong>Aide</strong><span className="preference-chevron">›</span></button>
      </div>
    </section>
    <SignOutWithPushCleanup action={signOutAthlete}><button type="submit" className="preference-signout"><LogOut />Se déconnecter</button></SignOutWithPushCleanup>
  </AthleteShell>;
}
