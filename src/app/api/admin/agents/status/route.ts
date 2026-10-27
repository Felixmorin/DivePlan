import { getCurrentUserAccess } from "@/lib/current-user";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getCurrentUserAccess();
  if (!user) return Response.json({error:"unauthorized"},{status:401});
  if (user.role !== "ADMIN") return Response.json({error:"forbidden"},{status:403});
  const ids = new URL(request.url).searchParams.getAll("id");
  if (!ids.length || ids.length > 20 || ids.some(id => !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) return Response.json({ error:"invalid_ids" },{status:400});
  const { rows } = await query<{id:string;status:string;startedAt:Date|null;finishedAt:Date|null;error:string|null}>(
    `SELECT id,status,"startedAt","finishedAt",left(error,1000) AS error FROM "AiAgentRun" WHERE id=ANY($1::text[]) ORDER BY id LIMIT 20`,[ids]);
  return Response.json({runs:rows},{headers:{"cache-control":"private, no-store"}});
}
