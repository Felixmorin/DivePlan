import { athletes as demoAthletes } from "@/lib/data";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type AvatarAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
};

export function AthleteAvatars({ ids, limit = 5, athletes = demoAthletes }: { ids: string[]; limit?: number; athletes?: AvatarAthlete[] }) {
  const selected = ids.map((id) => athletes.find((a) => a.id === id)).filter(Boolean);
  return (
    <div className="flex items-center">
      {selected.slice(0, limit).map((athlete) => (
        <Avatar key={athlete!.id} className="-ml-2 h-8 w-8 border-2 border-white shadow-sm first:ml-0">
          <AvatarImage src={athlete!.avatar ?? undefined} />
          <AvatarFallback>{athlete!.firstName.slice(0, 1)}{athlete!.lastName.slice(0, 1)}</AvatarFallback>
        </Avatar>
      ))}
      {selected.length > limit && <div className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[var(--color-navy)] text-xs font-black text-white shadow-sm">+{selected.length - limit}</div>}
    </div>
  );
}
