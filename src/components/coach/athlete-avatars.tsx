import { athletes as demoAthletes } from "@/lib/data";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type AvatarAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
};

export function AthleteAvatars({ ids, limit = 5, athletes = demoAthletes, size = "default" }: { ids: string[]; limit?: number; athletes?: AvatarAthlete[]; size?: "default" | "large" }) {
  const selected = Array.from(new Set(ids)).map((id) => athletes.find((a) => a.id === id)).filter(Boolean);
  const avatarSize = size === "large" ? "h-11 w-11" : "h-8 w-8";
  const overlap = size === "large" ? "-ml-2.5" : "-ml-2";
  return (
    <div className="flex items-center">
      {selected.slice(0, limit).map((athlete) => (
        <Avatar key={athlete!.id} className={`${overlap} ${avatarSize} border-2 border-white shadow-sm first:ml-0`}>
          <AvatarImage src={athlete!.avatar ?? undefined} />
          <AvatarFallback>{athlete!.firstName.slice(0, 1)}{athlete!.lastName.slice(0, 1)}</AvatarFallback>
        </Avatar>
      ))}
      {selected.length > limit && <div className={`${overlap} ${avatarSize} flex items-center justify-center rounded-full border-2 border-white bg-[var(--color-navy)] text-xs font-black text-white shadow-sm`}>+{selected.length - limit}</div>}
    </div>
  );
}
