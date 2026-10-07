import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { ProfileForm } from "@/components/athlete/profile-form";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { Button } from "@/components/ui/button";
import { getCurrentAthlete } from "@/lib/athlete-session";

export const dynamic = "force-dynamic";

export default async function AthletePreferencesPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");

  return (
    <AthleteShell>
      <div className="mb-5">
        <Button asChild variant="ghost" className="mb-5 -ml-3 text-white/65 hover:bg-white/8 hover:text-white">
          <Link href="/athlete/profile"><ArrowLeft className="h-4 w-4" /> Retour au profil</Link>
        </Button>
        <h1 className="text-3xl font-black">Préférences</h1>
        <p className="mt-2 text-sm text-white/55">Gère les notifications et les informations de ton profil.</p>
      </div>
      <div className="space-y-3">
        <NotificationSettings />
        <ProfileForm firstName={athlete.user.firstName} lastName={athlete.user.lastName} username={athlete.user.username} />
      </div>
    </AthleteShell>
  );
}
