import "server-only";
import { query } from "@/lib/db";
import { MILESTONES, type MilestoneKey } from "@/lib/milestones";

export type Milestone = { key: MilestoneKey; title: string; description: string };

export async function getClubMilestones(clubId: string): Promise<Milestone[]> {
  const overrides = await query<{ key: string; title: string; description: string }>(
    `SELECT key, title, description FROM "ClubMilestone" WHERE "clubId" = $1`, [clubId]
  );
  const byKey = new Map<string, { title: string; description: string }>(overrides.rows.map(({ key, title, description }) => [key, { title, description }]));
  return Object.values(MILESTONES).map((milestone) => {
    const override = byKey.get(milestone.key);
    return { key: milestone.key, title: override?.title ?? milestone.title, description: override?.description ?? milestone.description };
  });
}

export async function getClubMilestone(clubId: string, key: MilestoneKey): Promise<Milestone> {
  const milestones = await getClubMilestones(clubId);
  return milestones.find((milestone) => milestone.key === key)!;
}
