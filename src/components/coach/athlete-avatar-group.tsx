import { AthleteAvatars } from "./athlete-avatars";

type AvatarAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
};

export function AthleteAvatarGroup({ ids, limit = 5, athletes }: { ids: string[]; limit?: number; athletes?: AvatarAthlete[] }) {
  return <AthleteAvatars ids={ids} limit={limit} athletes={athletes} />;
}

