import { PrismaClient, BlockType, PoolHeight, SessionStatus, UserRole, WeekStatus } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const demoPasswordHash = await hashPassword("diveplan-demo");
  await prisma.appEvent.deleteMany();
  await prisma.userInvitation.deleteMany();
  await prisma.athleteExerciseLog.deleteMany();
  await prisma.athleteDiveLog.deleteMany();
  await prisma.athleteSessionCompletion.deleteMany();
  await prisma.athleteSkill.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.sessionTemplate.deleteMany();
  await prisma.poolDive.deleteMany();
  await prisma.poolSection.deleteMany();
  await prisma.poolTraining.deleteMany();
  await prisma.drylandBlockExercise.deleteMany();
  await prisma.sessionBlockAssignment.deleteMany();
  await prisma.sessionBlock.deleteMany();
  await prisma.trainingSession.deleteMany();
  await prisma.trainingWeek.deleteMany();
  await prisma.athlete.deleteMany();
  await prisma.coach.deleteMany();
  await prisma.user.deleteMany();
  await prisma.trainingGroup.deleteMany();
  await prisma.club.deleteMany();
  await prisma.drylandExercise.deleteMany();

  const club = await prisma.club.create({ data: { name: "Club Mustang", logo: "/mustang-mark.svg" } });
  const coachUser = await prisma.user.create({
    data: { firstName: "Felix", lastName: "Lavoie", email: "coach@diveplan.local", role: UserRole.COACH, clubId: club.id, passwordHash: demoPasswordHash, passwordSetAt: new Date() }
  });
  const coach = await prisma.coach.create({ data: { userId: coachUser.id, clubId: club.id } });
  const group = await prisma.trainingGroup.create({ data: { name: "Provincial", clubId: club.id, coachId: coach.id } });

  const names = [
    ["Emma", "Tremblay", "Niveau 4"],
    ["Charles", "Gagnon", "Niveau 5"],
    ["Leo", "Bergeron", "Niveau 4"],
    ["Juliette", "Roy", "Niveau 4"],
    ["Alice", "Martin", "Niveau 3"],
    ["Thomas", "Gagne", "Niveau 5"],
    ["Camille", "Bouchard", "Niveau 3"],
    ["Olivier", "Caron", "Niveau 4"]
  ];

  const athletes = await Promise.all(names.map(async ([firstName, lastName, level], index) => {
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}@diveplan.local`,
        role: UserRole.ATHLETE,
        passwordHash: demoPasswordHash,
        passwordSetAt: new Date(),
        clubId: club.id,
        avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${firstName}%20${lastName}`
      }
    });
    return prisma.athlete.create({
      data: {
        userId: user.id,
        clubId: club.id,
        groupId: group.id,
        birthDate: new Date(2010, index % 12, 7 + index),
        level,
        active: true
      },
      include: { user: true }
    });
  }));

  const exercises = await prisma.drylandExercise.createManyAndReturn({
    data: [
      { name: "Hollow hold", category: "Core", description: "Maintien gainage en fermeture active.", defaultSets: 3, defaultDuration: 30, equipment: "Tapis", tags: ["core", "ligne"] },
      { name: "Jump squat", category: "Power", description: "Impulsion explosive avec reception controlee.", defaultSets: 3, defaultReps: 8, equipment: "Aucun", tags: ["power", "jambes"] },
      { name: "Snap opening", category: "Technique", description: "Ouverture rapide depuis pike vers ligne.", defaultSets: 3, defaultReps: 6, equipment: "Tapis", tags: ["ouverture"] },
      { name: "Handstand hold", category: "Equilibre", description: "Maintien contre mur, épaules actives.", defaultSets: 4, defaultDuration: 25, equipment: "Mur", tags: ["equilibre"] },
      { name: "Pike compression", category: "Mobilite", description: "Compression active hanche et tronc.", defaultSets: 3, defaultReps: 10, equipment: "Blocs", tags: ["pike"] },
      { name: "Trampoline takeoff", category: "Takeoff", description: "Appuis et verticalite sur trampoline.", defaultSets: 5, defaultReps: 5, equipment: "Trampoline", tags: ["appel"] },
      { name: "Shoulder mobility", category: "Mobilite", description: "Ouverture epaules et activation scapulaire.", defaultSets: 2, defaultDuration: 45, equipment: "Elastique", tags: ["epaules"] }
    ]
  });

  const week = await prisma.trainingWeek.create({
    data: { clubId: club.id, groupId: group.id, startDate: new Date("2026-08-24"), title: "Semaine technique - Arriere", status: WeekStatus.PUBLISHED }
  });

  const session = await prisma.trainingSession.create({
    data: {
      date: new Date("2026-08-25T16:30:00"),
      title: "Arriere + ouverture",
      duration: 90,
      focus: "203C, 201B, entrees propres",
      notes: "Message coach: rester patient sur les ouvertures, priorite a la ligne.",
      weekId: week.id,
      coachId: coach.id,
      status: SessionStatus.READY
    }
  });

  const emma = athletes[0], charles = athletes[1], leo = athletes[2], juliette = athletes[3], alice = athletes[4];
  const createAssignments = (blockId: string, ids: string[]) =>
    prisma.sessionBlockAssignment.createMany({ data: ids.map((athleteId) => ({ sessionBlockId: blockId, athleteId })) });

  const commonDry = await prisma.sessionBlock.create({ data: { sessionId: session.id, type: BlockType.DRYLAND, title: "Dryland A - Power ouverture", duration: 22, position: 1, estimatedVolume: 54 } });
  await createAssignments(commonDry.id, [emma.id, leo.id]);
  await prisma.drylandBlockExercise.createMany({
    data: [
      { blockId: commonDry.id, exerciseId: exercises[1].id, sets: 3, reps: 8, order: 1 },
      { blockId: commonDry.id, exerciseId: exercises[0].id, sets: 3, duration: 30, order: 2 },
      { blockId: commonDry.id, exerciseId: exercises[2].id, sets: 3, reps: 6, order: 3 }
    ]
  });

  const charlesDry = await prisma.sessionBlock.create({ data: { sessionId: session.id, type: BlockType.DRYLAND, title: "Dryland B - Equilibre Charles", duration: 18, position: 2, estimatedVolume: 35 } });
  await createAssignments(charlesDry.id, [charles.id]);
  await prisma.drylandBlockExercise.createMany({
    data: [
      { blockId: charlesDry.id, exerciseId: exercises[3].id, sets: 4, duration: 25, order: 1 },
      { blockId: charlesDry.id, exerciseId: exercises[6].id, sets: 2, duration: 45, order: 2 }
    ]
  });

  async function poolBlock(title: string, assignedIds: string[], meterOne: string[][], meterThree: string[][]) {
    const volume = [...meterOne, ...meterThree].reduce((sum, dive) => sum + Number(dive[2]), 0);
    const block = await prisma.sessionBlock.create({ data: { sessionId: session.id, type: BlockType.POOL, title, duration: 45, position: 10, estimatedVolume: volume } });
    await createAssignments(block.id, assignedIds);
    await prisma.poolTraining.create({ data: { blockId: block.id } });
    const one = await prisma.poolSection.create({ data: { poolTrainingId: block.id, height: PoolHeight.ONE_METER, label: "1 metre" } });
    const three = await prisma.poolSection.create({ data: { poolTrainingId: block.id, height: PoolHeight.THREE_METER, label: "3 metres" } });
    await prisma.poolDive.createMany({ data: meterOne.map(([code, name, reps], order) => ({ poolSectionId: one.id, diveCode: code, diveName: name, position: code.slice(-1), repetitions: Number(reps), order })) });
    await prisma.poolDive.createMany({ data: meterThree.map(([code, name, reps], order) => ({ poolSectionId: three.id, diveCode: code, diveName: name, position: code.slice(-1), repetitions: Number(reps), order })) });
  }

  await poolBlock("Pool A - Emma + Leo", [emma.id, leo.id], [["101C", "Avant groupe", "3"], ["201B", "Arriere carpé", "5"], ["203C", "Un et demi arriere", "4"]], [["201C", "Arriere groupe", "4"], ["301C", "Retour groupe", "4"], ["401B", "Renverse carpé", "3"]]);
  await poolBlock("Pool B - Charles", [charles.id], [["201C", "Arriere groupe", "4"], ["301C", "Retour groupe", "5"]], [["401B", "Renverse carpé", "4"], ["5331D", "Vrille avant", "3"]]);
  await poolBlock("Pool C - Juliette + Alice", [juliette.id, alice.id], [["101C", "Avant groupe", "3"], ["201C", "Arriere groupe", "4"], ["301C", "Retour groupe", "3"]], [["201C", "Arriere groupe", "4"], ["301C", "Retour groupe", "4"], ["Plongeon libre", "Choix technique", "3"]]);

  await prisma.sessionTemplate.createMany({
    data: [
      { name: "Arriere - ouverture", category: "Technique", clubId: club.id, sessionId: session.id, favorite: true, payload: { focus: "Ouverture arriere" } },
      { name: "Retour technique", category: "Piscine", clubId: club.id, payload: { focus: "301C" } },
      { name: "Simulation competition", category: "Competition", clubId: club.id, payload: { rounds: 6 } },
      { name: "Pre-competition", category: "Taper", clubId: club.id, payload: { volume: "low" } },
      { name: "Dryland power", category: "Dryland", clubId: club.id, favorite: true, payload: { exercises: ["Jump squat", "Snap opening"] } }
    ]
  });

  const skills = await prisma.skill.createManyAndReturn({
    data: [
      { name: "Arriere carpe", code: "201B", category: "Arriere", height: "1m", prerequisites: ["101C"] },
      { name: "Un et demi arriere", code: "203C", category: "Arriere", height: "3m", prerequisites: ["201C"] },
      { name: "Retour groupe", code: "301C", category: "Retour", height: "3m", prerequisites: ["201C"] }
    ]
  });
  await prisma.athleteSkill.createMany({
    data: skills.map((skill, index) => ({ athleteId: emma.id, skillId: skill.id, level: 4, progress: [78, 62, 71][index], status: "DEVELOPING", trainings: [12, 8, 9][index], repetitions: [42, 31, 36][index] }))
  });

  console.log("Seed complete: Club Mustang, Provincial group, flexible assignments, dryland and pool blocks.");
}

main().finally(async () => prisma.$disconnect());
