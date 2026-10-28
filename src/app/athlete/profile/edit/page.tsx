import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { ProfileEditor } from "@/components/athlete/profile-editor";
import { getCurrentAthlete } from "@/lib/athlete-session";
import { resolveAvatarUrls } from "@/lib/avatar-storage";

export const dynamic = "force-dynamic";

export default async function AthleteProfileEditPage() {
  const athlete = await getCurrentAthlete();
  if (!athlete) redirect("/login");
  const [avatarUrl] = await resolveAvatarUrls([athlete.user.avatar]);
  const competitionHeights = [...new Set(athlete.competitionDives.flatMap((dive) => dive.height === "ONE_METER" ? ["1 m"] : dive.height === "THREE_METER" ? ["3 m"] : []))];

  return <AthleteShell hideNav className="profile-edit-page">
    <header className="profile-edit-header"><Link href="/athlete/profile" aria-label="Retour au profil"><ArrowLeft /></Link><h1>Modifier mon profil</h1></header>
    <ProfileEditor firstName={athlete.user.firstName} lastName={athlete.user.lastName} avatarUrl={avatarUrl} level={athlete.level} club={athlete.club.name} competitionHeights={competitionHeights} />
  </AthleteShell>;
}
