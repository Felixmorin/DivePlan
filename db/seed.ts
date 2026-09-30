import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/password";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const id = () => randomUUID();

async function main() {
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required to seed demo data.");
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    for(const table of ["AppEvent","AthleteCompetitionDiveEvaluation","AthleteExerciseLog","AthleteDiveLog","AthleteDiveNote","AthleteBlockTiming","AthleteSessionCompletion","AthleteSessionAbsence","AthleteSkill","Skill","SessionTemplate","PoolDive","PoolSection","PoolTraining","DrylandBlockExercise","SessionBlockAssignment","SessionBlock","TrainingSession","TrainingWeek","PlanningEvent","CompetitionDive","Athlete","TrainingGroup","Coach","User","Club","DrylandExercise"]) await client.query(`DELETE FROM "${table}"`);

    const passwordHash=await hashPassword("diveplan-demo");
    const club=(await client.query<{id:string}>(`INSERT INTO "Club" (id,name,logo) VALUES ($1,'Club Mustang','/mustang-mark.svg') RETURNING id`,[id()])).rows[0];
    const coachUser=(await client.query<{id:string}>(`INSERT INTO "User" (id,"firstName","lastName",email,role,"clubId","passwordHash","passwordSetAt") VALUES ($1,'Felix','Morin','coach@diveplan.local','COACH',$2,$3,NOW()) RETURNING id`,[id(),club.id,passwordHash])).rows[0];
    const coach=(await client.query<{id:string}>(`INSERT INTO "Coach" (id,"userId","clubId") VALUES ($1,$2,$3) RETURNING id`,[id(),coachUser.id,club.id])).rows[0];
    const group=(await client.query<{id:string}>(`INSERT INTO "TrainingGroup" (id,name,"clubId","coachId") VALUES ($1,'Provincial',$2,$3) RETURNING id`,[id(),club.id,coach.id])).rows[0];
    const names=[["Emma","Tremblay","Niveau 4"],["Charles","Gagnon","Niveau 5"],["Leo","Bergeron","Niveau 4"],["Juliette","Roy","Niveau 4"],["Alice","Martin","Niveau 3"],["Thomas","Gagne","Niveau 5"],["Camille","Bouchard","Niveau 3"],["Olivier","Caron","Niveau 4"]];
    const athletes:{id:string}[]=[];
    for(const [index,[first,last,level]] of names.entries()){
      const user=(await client.query<{id:string}>(`INSERT INTO "User" (id,"firstName","lastName",email,role,"passwordHash","passwordSetAt","clubId",avatar) VALUES ($1,$2,$3,$4,'ATHLETE',$5,NOW(),$6,$7) RETURNING id`,[id(),first,last,`${first.toLowerCase()}@diveplan.local`,passwordHash,club.id,`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(first)}%20${encodeURIComponent(last)}`])).rows[0];
      athletes.push((await client.query<{id:string}>(`INSERT INTO "Athlete" (id,"userId","clubId","groupId","birthDate",level,active) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,[id(),user.id,club.id,group.id,new Date(2010,index%12,7+index),level])).rows[0]);
    }
    const exerciseData=[
      ["Hollow hold","Core","Maintien gainage en fermeture active.",3,null,30,"Tapis",["core","ligne"]],
      ["Jump squat","Power","Impulsion explosive avec reception controlee.",3,8,null,"Aucun",["power","jambes"]],
      ["Snap opening","Technique","Ouverture rapide depuis pike vers ligne.",3,6,null,"Tapis",["ouverture"]],
      ["Handstand hold","Equilibre","Maintien contre mur, épaules actives.",4,null,25,"Mur",["equilibre"]],
      ["Pike compression","Mobilite","Compression active hanche et tronc.",3,10,null,"Blocs",["pike"]],
      ["Trampoline takeoff","Takeoff","Appuis et verticalite sur trampoline.",5,5,null,"Trampoline",["appel"]],
      ["Shoulder mobility","Mobilite","Ouverture epaules et activation scapulaire.",2,null,45,"Elastique",["epaules"]]
    ] as const;
    const exercises:{id:string}[]=[];
    for(const [name,category,description,sets,reps,duration,equipment,tags] of exerciseData) exercises.push((await client.query<{id:string}>(`INSERT INTO "DrylandExercise" (id,name,category,description,"defaultSets","defaultReps","defaultDuration",equipment,tags,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING id`,[id(),name,category,description,sets,reps,duration,equipment,tags])).rows[0]);
    const week=(await client.query<{id:string}>(`INSERT INTO "TrainingWeek" (id,"clubId","groupId","startDate",title,status) VALUES ($1,$2,$3,'2026-08-24','Semaine technique - Arriere','PUBLISHED') RETURNING id`,[id(),club.id,group.id])).rows[0];
    const session=(await client.query<{id:string}>(`INSERT INTO "TrainingSession" (id,date,title,duration,focus,notes,"weekId","coachId",status) VALUES ($1,'2026-08-25T16:30:00', 'Arriere + ouverture',90,'203C, 201B, entrees propres','Message coach: rester patient sur les ouvertures, priorite a la ligne.',$2,$3,'READY') RETURNING id`,[id(),week.id,coach.id])).rows[0];
    const [emma,charles,leo,juliette,alice]=athletes;
    const createBlock=async(type:string,title:string,duration:number,position:number,volume:number)=> (await client.query<{id:string}>(`INSERT INTO "SessionBlock" (id,"sessionId",type,title,duration,position,"estimatedVolume") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[id(),session.id,type,title,duration,position,volume])).rows[0];
    const assign=async(blockId:string,ids:string[])=>{for(const athleteId of ids)await client.query(`INSERT INTO "SessionBlockAssignment" (id,"sessionBlockId","athleteId") VALUES ($1,$2,$3)`,[id(),blockId,athleteId]);};
    const commonDry=await createBlock("DRYLAND","Dryland A - Power ouverture",22,1,54);await assign(commonDry.id,[emma.id,leo.id]);
    for(const [exerciseId,sets,reps,duration,order] of [[exercises[1].id,3,8,null,1],[exercises[0].id,3,null,30,2],[exercises[2].id,3,6,null,3]] as const)await client.query(`INSERT INTO "DrylandBlockExercise" ("blockId","exerciseId",sets,reps,duration,"order") VALUES ($1,$2,$3,$4,$5,$6)`,[commonDry.id,exerciseId,sets,reps,duration,order]);
    const charlesDry=await createBlock("DRYLAND","Dryland B - Equilibre Charles",18,2,35);await assign(charlesDry.id,[charles.id]);
    for(const [exerciseId,sets,duration,order] of [[exercises[3].id,4,25,1],[exercises[6].id,2,45,2]] as const)await client.query(`INSERT INTO "DrylandBlockExercise" ("blockId","exerciseId",sets,duration,"order") VALUES ($1,$2,$3,$4,$5)`,[charlesDry.id,exerciseId,sets,duration,order]);
    async function poolBlock(title:string,assigned:string[],oneMeter:string[][],threeMeter:string[][]){const volume=[...oneMeter,...threeMeter].reduce((sum,dive)=>sum+Number(dive[2]),0);const block=await createBlock("POOL",title,45,10,volume);await assign(block.id,assigned);await client.query(`INSERT INTO "PoolTraining" ("blockId") VALUES ($1)`,[block.id]);for(const [height,label,dives] of [["ONE_METER","1 metre",oneMeter],["THREE_METER","3 metres",threeMeter]] as const){const sectionId=id();await client.query(`INSERT INTO "PoolSection" (id,"poolTrainingId",height,label,"order") VALUES ($1,$2,$3,$4,$5)`,[sectionId,block.id,height,label,height==="ONE_METER"?0:1]);for(const [order,[code,name,reps]] of dives.entries())await client.query(`INSERT INTO "PoolDive" (id,"poolSectionId","diveCode","diveName",position,repetitions,"order") VALUES ($1,$2,$3,$4,$5,$6,$7)`,[id(),sectionId,code,name,code.slice(-1),Number(reps),order]);}}
    await poolBlock("Pool A - Emma + Leo",[emma.id,leo.id],[["101C","Avant groupe","3"],["201B","Arriere carpé","5"],["203C","Un et demi arriere","4"]],[["201C","Arriere groupe","4"],["301C","Retour groupe","4"],["401B","Renverse carpé","3"]]);
    await poolBlock("Pool B - Charles",[charles.id],[["201C","Arriere groupe","4"],["301C","Retour groupe","5"]],[["401B","Renverse carpé","4"],["5331D","Vrille avant","3"]]);
    await poolBlock("Pool C - Juliette + Alice",[juliette.id,alice.id],[["101C","Avant groupe","3"],["201C","Arriere groupe","4"],["301C","Retour groupe","3"]],[["201C","Arriere groupe","4"],["301C","Retour groupe","4"],["Plongeon libre","Choix technique","3"]]);
    for(const [name,category,payload,favorite,sessionId] of [["Arriere - ouverture","Technique",{focus:"Ouverture arriere"},true,session.id],["Retour technique","Piscine",{focus:"301C"},false,null],["Simulation competition","Competition",{rounds:6},false,null],["Pre-competition","Taper",{volume:"low"},false,null],["Dryland power","Dryland",{exercises:["Jump squat","Snap opening"]},true,null]] as const)await client.query(`INSERT INTO "SessionTemplate" (id,name,category,"clubId","sessionId",favorite,payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,[id(),name,category,club.id,sessionId,favorite,JSON.stringify(payload)]);
    const skillData=[["Arriere carpe","201B","Arriere","1m",["101C"]],["Un et demi arriere","203C","Arriere","3m",["201C"]],["Retour groupe","301C","Retour","3m",["201C"]]] as const;
    for(const [index,[name,code,category,height,prerequisites]] of skillData.entries()){const skill=(await client.query<{id:string}>(`INSERT INTO "Skill" (id,name,code,category,height,prerequisites) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,[id(),name,code,category,height,prerequisites])).rows[0];await client.query(`INSERT INTO "AthleteSkill" ("athleteId","skillId",level,progress,status,trainings,repetitions) VALUES ($1,$2,4,$3,'DEVELOPING',$4,$5)`,[emma.id,skill.id,[78,62,71][index],[12,8,9][index],[42,31,36][index]]);}
    await client.query("COMMIT");
    console.log("Seed complete: Club Mustang, Provincial group, flexible assignments, dryland and pool blocks.");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>pool.end());
