import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/current-user";
import { getLiveSessionProgress } from "@/lib/live-session-progress";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  if (user.role !== "COACH" || !user.coach || !user.clubId) {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const { id } = await params;
  const progress = await getLiveSessionProgress(id, user.clubId);
  if (!progress) return Response.json({ error: "not_found" }, { status: 404, headers });
  // Always authenticate and read within the current club before validating.
  // Keep the validator in this client only; private progress is never CDN cached.
  const body = JSON.stringify(progress);
  const etag = `W/"${createHash("sha256").update(JSON.stringify([user.clubId, id, body])).digest("hex")}"`;
  const responseHeaders = { ...headers, etag };
  const validators = request.headers.get("if-none-match")?.split(",").map((value) => value.trim().replace(/^W\//, ""));
  if (validators?.includes(etag.replace(/^W\//, ""))) {
    return new Response(null, { status: 304, headers: responseHeaders });
  }
  return new Response(body, { headers: { ...responseHeaders, "content-type": "application/json" } });
}
