import { getCurrentUserAccess } from "@/lib/current-user";
import { getLiveSessionProgressReply } from "@/lib/live-session-progress";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserAccess();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  if (user.role !== "COACH" || !user.coach || !user.clubId) {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const { id } = await params;
  const validators = request.headers.get("if-none-match")?.split(",").map((value) => value.trim().replace(/^W\//, "")) ?? [];
  const result = await getLiveSessionProgressReply(id, user.clubId, validators);
  if (!result) return Response.json({ error: "not_found" }, { status: 404, headers });
  const responseHeaders = { ...headers, etag: `W/${result.etag}` };
  if (result.progress === null) {
    return new Response(null, { status: 304, headers: responseHeaders });
  }
  return Response.json(result.progress, { headers: responseHeaders });
}
