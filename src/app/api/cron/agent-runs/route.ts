import { runNextAgentJobs } from "@/lib/agent-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ processed: await runNextAgentJobs() });
  } catch (error) {
    console.error("Agent run worker failed", error);
    return Response.json({ error: "Agent run worker failed." }, { status: 500 });
  }
}
