import { BlockType, PoolHeight, PrismaClient, SessionStatus, UserRole, WeekStatus } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const pilotPassword = process.env.PILOT_SEED_PASSWORD ?? "diveplan-pilot";

async function main() {
  const passwordHash = await hashPassword(pilotPassword);
  const nextMonday = getNextMonday();

  const club = await findOrCreateClub("DivePlan Pilote");
  const coachUser = await prisma.user.upsert({
    where: { email: "coach.pilote@diveplan.local" },
    create: {
      firstName: "Felix",
      lastName: "Coach",
      email: "coach.pilote@diveplan.local",
      role: UserRole.COACH,
      clubId: club.id,
      passwordHash,
      passwordSetAt: new Date()
    },
    update: {
      firstName: "Felix",
      lastName: "Coach",
      role: UserRole.COACH,
      clubId: club.id,
      passwordHash,
      passwordSetAt: new Date()
    }
  });
  const coach = await prisma.coach.upsert({
    where: { userId: coachUser.id },
    create: { userId: coachUser.id, clubId: club.id },
    update: { clubId: club.id }
  });
  const group = await findOrCreateGroup("Groupe pilote", club.id, coach.id);

  const athletes = await Promise.all([
    upsertAthlete({ firstName: "Emma", lastName: "Pilote", email: "emma.pilote@diveplan.local", level: "Niveau 4", clubId: club.id, groupId: group.id, passwordHash }),
    upsertAthlete({ firstName: "Leo", lastName: "Pilote", email: "leo.pilote@diveplan.local", level: "Niveau 4", clubId: club.id, groupId: group.id, passwordHash }),
    upsertAthlete({ firstName: "Mia", lastName: "Pilote", email: "mia.pilote@diveplan.local", level: "Niveau 3", clubId: club.id, groupId: group.id, passwordHash })
  ]);

  const exercises = await Promise.all([
    findOrCreateExercise({ name: "Hollow hold pilote", category: "Core", description: "Maintien gainage propre pour lancer la seance.", defaultSets: 3, defaultDuration: 30, equipment: "Tapis", tags: ["pilote", "core"] }),
    findOrCreateExercise({ name: "Snap opening pilote", category: "Technique", description: "Ouverture rapide depuis pike vers ligne.", defaultSets: 3, defaultReps: 6, equipment: "Tapis", tags: ["pilote", "ouverture"] }),
    findOrCreateExercise({ name: "Jump squat pilote", category: "Power", description: "Impulsion explosive avec reception controlee.", defaultSets: 3, defaultReps: 8, equipment: "Aucun", tags: ["pilote", "jambes"] })
  ]);

  const week = await findOrCreateWeek({
    clubId: club.id,
    groupId: group.id,
    startDate: nextMonday,
    title: "Semaine pilote",
    status: WeekStatus.PUBLISHED
  });
  const session = await findOrCreateSession({
    title: "Pilote lundi - dryland + bassin",
    date: withTime(nextMonday, 16, 30),
    duration: 75,
    focus: "Verifier si le prevu vs realise aide le coach apres la seance",
    notes: "Chemin pilote: les athletes se connectent, suivent les blocs, puis le coach lit les resultats.",
    weekId: week.id,
    coachId: coach.id
  });

  const dryland = await findOrCreateBlock({ sessionId: session.id, type: BlockType.DRYLAND, title: "Dryland pilote", duration: 20, position: 1, estimatedVolume: 51 });
  await assignBlock(dryland.id, athletes.map((athlete) => athlete.id));
  await prisma.drylandBlockExercise.createMany({
    data: [
      { blockId: dryland.id, exerciseId: exercises[0].id, sets: 3, duration: 30, order: 1 },
      { blockId: dryland.id, exerciseId: exercises[1].id, sets: 3, reps: 6, order: 2 },
      { blockId: dryland.id, exerciseId: exercises[2].id, sets: 3, reps: 8, order: 3 }
    ],
    skipDuplicates: true
  });

  const pool = await findOrCreateBlock({ sessionId: session.id, type: BlockType.POOL, title: "Piscine pilote - arriere", duration: 45, position: 2, estimatedVolume: 27 });
  await assignBlock(pool.id, athletes.map((athlete) => athlete.id));
  await prisma.poolTraining.upsert({ where: { blockId: pool.id }, create: { blockId: pool.id }, update: {} });
  const oneMeter = await findOrCreatePoolSection(pool.id, PoolHeight.ONE_METER, "1 metre");
  const threeMeter = await findOrCreatePoolSection(pool.id, PoolHeight.THREE_METER, "3 metres");
  await createDiveIfMissing(oneMeter.id, "101C", "Avant groupe", "C", 3, 1);
  await createDiveIfMissing(oneMeter.id, "201C", "Arriere groupe", "C", 4, 2);
  await createDiveIfMissing(oneMeter.id, "201B", "Arriere carpe", "B", 4, 3);
  await createDiveIfMissing(threeMeter.id, "203C", "Un et demi arriere", "C", 4, 1);
  await createDiveIfMissing(threeMeter.id, "301C", "Retour groupe", "C", 4, 2);
  await createDiveIfMissing(threeMeter.id, "401B", "Renverse carpe", "B", 3, 3);

  await prisma.sessionTemplate.upsert({
    where: { id: `${session.id}-pilot-template` },
    create: {
      id: `${session.id}-pilot-template`,
      name: "Pilote lundi - pret a reutiliser",
      category: "Pilote",
      clubId: club.id,
      sessionId: session.id,
      favorite: true,
      payload: { source: "seed-pilot", focus: session.focus }
    },
    update: {
      favorite: true,
      payload: { source: "seed-pilot", focus: session.focus }
    }
  });

  console.log(`Seed pilote pret pour ${nextMonday.toISOString().slice(0, 10)}.`);
  console.log(`Coach: coach.pilote@diveplan.local / ${pilotPassword}`);
  console.log(`Athletes: emma.pilote@diveplan.local, leo.pilote@diveplan.local, mia.pilote@diveplan.local / ${pilotPassword}`);
}

async function findOrCreateClub(name: string) {
  return (await prisma.club.findFirst({ where: { name } })) ?? prisma.club.create({ data: { name } });
}

async function findOrCreateGroup(name: string, clubId: string, coachId: string) {
  return (await prisma.trainingGroup.findFirst({ where: { name, clubId } })) ?? prisma.trainingGroup.create({ data: { name, clubId, coachId } });
}

async function upsertAthlete(input: { firstName: string; lastName: string; email: string; level: string; clubId: string; groupId: string; passwordHash: string }) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      role: UserRole.ATHLETE,
      clubId: input.clubId,
      passwordHash: input.passwordHash,
      passwordSetAt: new Date()
    },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      role: UserRole.ATHLETE,
      clubId: input.clubId,
      passwordHash: input.passwordHash,
      passwordSetAt: new Date()
    }
  });

  return prisma.athlete.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      clubId: input.clubId,
      groupId: input.groupId,
      birthDate: new Date("2010-01-01"),
      level: input.level,
      active: true
    },
    update: { clubId: input.clubId, groupId: input.groupId, level: input.level, active: true }
  });
}

async function findOrCreateExercise(data: { name: string; category: string; description: string; defaultSets?: number; defaultReps?: number; defaultDuration?: number; equipment: string; tags: string[] }) {
  return (await prisma.drylandExercise.findFirst({ where: { name: data.name } })) ?? prisma.drylandExercise.create({ data });
}

async function findOrCreateWeek(data: { clubId: string; groupId: string; startDate: Date; title: string; status: WeekStatus }) {
  return (await prisma.trainingWeek.findFirst({ where: { clubId: data.clubId, groupId: data.groupId, startDate: data.startDate, title: data.title } })) ?? prisma.trainingWeek.create({ data });
}

async function findOrCreateSession(data: { title: string; date: Date; duration: number; focus: string; notes: string; weekId: string; coachId: string }) {
  return (await prisma.trainingSession.findFirst({ where: { title: data.title, weekId: data.weekId } })) ?? prisma.trainingSession.create({ data: { ...data, status: SessionStatus.READY } });
}

async function findOrCreateBlock(data: { sessionId: string; type: BlockType; title: string; duration: number; position: number; estimatedVolume: number }) {
  return (await prisma.sessionBlock.findFirst({ where: { sessionId: data.sessionId, title: data.title } })) ?? prisma.sessionBlock.create({ data });
}

async function assignBlock(blockId: string, athleteIds: string[]) {
  await prisma.sessionBlockAssignment.createMany({
    data: athleteIds.map((athleteId) => ({ sessionBlockId: blockId, athleteId })),
    skipDuplicates: true
  });
}

async function findOrCreatePoolSection(poolTrainingId: string, height: PoolHeight, label: string) {
  return (await prisma.poolSection.findFirst({ where: { poolTrainingId, height } })) ?? prisma.poolSection.create({ data: { poolTrainingId, height, label } });
}

async function createDiveIfMissing(poolSectionId: string, diveCode: string, diveName: string, position: string, repetitions: number, order: number) {
  const existing = await prisma.poolDive.findFirst({ where: { poolSectionId, diveCode, order } });
  if (existing) return existing;
  return prisma.poolDive.create({ data: { poolSectionId, diveCode, diveName, position, repetitions, order } });
}

function getNextMonday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  const daysUntilMonday = day === 1 ? 7 : 8 - day;
  date.setDate(date.getDate() + daysUntilMonday);
  return date;
}

function withTime(date: Date, hours: number, minutes: number) {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

main().finally(async () => prisma.$disconnect());
