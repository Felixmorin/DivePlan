"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { query } from "@/lib/db";
import { MILESTONES } from "@/lib/milestones";

const milestoneKeys = new Set(Object.values(MILESTONES).map((milestone) => milestone.key));
const milestoneTextSchema = z.object({
  key: z.string().refine((key) => milestoneKeys.has(key as typeof MILESTONES[keyof typeof MILESTONES]["key"])),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500)
});

export async function saveMilestoneText(formData: FormData) {
  const { clubId } = await requireCoach();
  const parsed = milestoneTextSchema.safeParse({
    key: formData.get("key"),
    title: formData.get("title"),
    description: formData.get("description")
  });
  if (!parsed.success) throw new Error("Vérifie le titre et la description du milestone.");
  if (clubId === "dev-club") throw new Error("Les milestones ne peuvent pas être modifiés dans le compte démo.");

  await query(
    `INSERT INTO "ClubMilestone" ("clubId", key, title, description) VALUES ($1, $2, $3, $4)
     ON CONFLICT ("clubId", key) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description`,
    [clubId, parsed.data.key, parsed.data.title, parsed.data.description]
  );

  revalidatePath("/coach/milestones");
  revalidatePath("/athlete/profile");
  revalidatePath("/athlete/session/[id]", "page");
}
