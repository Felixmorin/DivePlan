import { getCurrentUser } from "@/lib/current-user";
import { getLiveSessionProgress } from "@/lib/live-session-progress";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  if (user.role !== "COACH" || !user.coach || !user.clubId) {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const { id } = await params;
  const progress = await getLiveSessionProgress(id, user.clubId);
  if (!progress) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json(progress, { headers });
}
