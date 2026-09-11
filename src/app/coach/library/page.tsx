import { CoachShell } from "@/components/coach/coach-shell";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { sessionTemplatePayloadSchema } from "@/lib/session-template";
import { LibraryClient } from "./library-client";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { clubId } = await requireCoach();
  if (clubId === "dev-club") return <CoachShell active="Bibliotheque"><LibraryClient exercises={[]} dives={[]} templates={[]} /></CoachShell>;
  const [rawExercises, rawDives, rawTemplates] = await Promise.all([
    prisma.drylandExercise.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, include: { blockExercises: { include: { block: { include: { session: { select: { date: true, week: { select: { clubId: true } } } } } } } } } }),
    prisma.poolDive.findMany({ where: { poolSection: { poolTraining: { block: { session: { week: { clubId } } } } } }, orderBy: [{ diveCode: "asc" }, { order: "asc" }], select: { diveCode: true, diveName: true, position: true, poolSection: { select: { height: true } } } }),
    prisma.sessionTemplate.findMany({ where: { clubId }, orderBy: [{ favorite: "desc" }, { name: "asc" }] })
  ]);
  const exercises = rawExercises.map((exercise) => { const lastUsed = exercise.blockExercises.filter((item) => item.block.session.week.clubId === clubId).map((item) => item.block.session.date).sort((a, b) => b.getTime() - a.getTime())[0]; return { ...exercise, lastUsed: lastUsed?.toISOString() ?? null }; });
  const dives = rawDives.map((dive) => ({ code: dive.diveCode, name: dive.diveName, heights: [dive.poolSection.height === "ONE_METER" ? "1 m" : dive.poolSection.height === "THREE_METER" ? "3 m" : "Autre"], family: familyForDive(dive.position) }));
  const templates = rawTemplates.map((template) => ({ id: template.id, name: template.name, category: template.category, favorite: template.favorite, blocks: sessionTemplatePayloadSchema.safeParse(template.payload).success ? sessionTemplatePayloadSchema.parse(template.payload).blocks.length : 0 }));
  return <CoachShell active="Bibliotheque"><LibraryClient exercises={exercises} dives={dives} templates={templates} /></CoachShell>;
}

function familyForDive(position: string) { const value = position.toLowerCase(); if (value.includes("arrière") || value.includes("arriere")) return "Arrière"; if (value.includes("renvers")) return "Renversé"; if (value.includes("retourn")) return "Retourné"; if (value.includes("vrill")) return "Vrille"; return "Avant"; }
