import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function AthletePageHeader({ title, avatarUrl, initials, subtitle, brand = false, showAvatar = true }: {
  title: string;
  avatarUrl?: string | null;
  initials?: string;
  subtitle?: string;
  brand?: boolean;
  showAvatar?: boolean;
}) {
  return <header className={`athlete-page-header ${brand ? "athlete-home-header" : ""}`}>
    <div>{brand && <div className="athlete-brand">Dive<span>Plan</span></div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {showAvatar && <Avatar className="athlete-header-avatar"><AvatarImage src={avatarUrl ?? undefined} /><AvatarFallback>{initials ?? ""}</AvatarFallback></Avatar>}
  </header>;
}
