import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/password";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pilotPassword = process.env.PILOT_SEED_PASSWORD ?? "diveplan-pilot";
const id = () => randomUUID();

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to seed the pilot data.");
  const passwordHash = await hashPassword(pilotPassword);
  const nextMonday = getNextMonday();
  const club = await findOrCreate(`SELECT id FROM "Club" WHERE name=$1 LIMIT 1`, ["DivePlan"], `INSERT INTO "Club" (id,name) VALUES ($1,$2) RETURNING id`, [id(),"DivePlan"]);
  const coachUser = await pool.query<{id:string}>(`INSERT INTO "User" (id,"firstName","lastName",email,role,"clubId","passwordHash","passwordSetAt") VALUES ($1,'Felix','Coach','coach.pilote@diveplan.local','COACH',$2,$3,NOW()) ON CONFLICT (email) DO UPDATE SET "firstName"='Felix',"lastName"='Coach',role='COACH',"clubId"=EXCLUDED."clubId","passwordHash"=EXCLUDED."passwordHash","passwordSetAt"=NOW() RETURNING id`,[id(),club.id,passwordHash]);
  const coach = (await pool.query<{id:string}>(`INSERT INTO "Coach" (id,"userId","clubId") VALUES ($1,$2,$3) ON CONFLICT ("userId") DO UPDATE SET "clubId"=EXCLUDED."clubId" RETURNING id`,[id(),coachUser.rows[0].id,club.id])).rows[0];
  const group = await findOrCreate(`SELECT id FROM "TrainingGroup" WHERE name=$1 AND "clubId"=$2 LIMIT 1`,["Groupe pilote",club.id],`INSERT INTO "TrainingGroup" (id,name,"clubId","coachId") VALUES ($1,$2,$3,$4) RETURNING id`,[id(),"Groupe pilote",club.id,coach.id]);

  const athletes = await Promise.all([
    upsertAthlete("Emma","Pilote","emma.pilote@diveplan.local","Niveau 4",club.id,group.id,passwordHash),
    upsertAthlete("Leo","Pilote","leo.pilote@diveplan.local","Niveau 4",club.id,group.id,passwordHash),
    upsertAthlete("Mia","Pilote","mia.pilote@diveplan.local","Niveau 3",club.id,group.id,passwordHash)
  ]);
  const exercises = await Promise.all([
    findOrCreateExercise({name:"Hollow hold pilote",category:"Core",description:"Maintien gainage propre pour lancer la seance.",defaultSets:3,defaultDuration:30,equipment:"Tapis",tags:["pilote","core"]}),
    findOrCreateExercise({name:"Snap opening pilote",category:"Technique",description:"Ouverture rapide depuis pike vers ligne.",defaultSets:3,defaultReps:6,equipment:"Tapis",tags:["pilote","ouverture"]}),
    findOrCreateExercise({name:"Jump squat pilote",category:"Power",description:"Impulsion explosive avec reception controlee.",defaultSets:3,defaultReps:8,equipment:"Aucun",tags:["pilote","jambes"]})
  ]);
  const week = await findOrCreate(`SELECT id FROM "TrainingWeek" WHERE "clubId"=$1 AND "groupId"=$2 AND "startDate"=$3 AND title=$4 LIMIT 1`,[club.id,group.id,nextMonday,"Semaine pilote"],`INSERT INTO "TrainingWeek" (id,"clubId","groupId","startDate",title,status) VALUES ($1,$2,$3,$4,$5,'PUBLISHED') RETURNING id`,[id(),club.id,group.id,nextMonday,"Semaine pilote"]);
  const session = await findOrCreate(`SELECT id,focus FROM "TrainingSession" WHERE title=$1 AND "weekId"=$2 LIMIT 1`,["Pilote lundi - dryland + bassin",week.id],`INSERT INTO "TrainingSession" (id,title,date,duration,focus,notes,"weekId","coachId",status) VALUES ($1,$2,$3,75,$4,$5,$6,$7,'READY') RETURNING id,focus`,[id(),"Pilote lundi - dryland + bassin",withTime(nextMonday,16,30),"Verifier si le prevu vs realise aide le coach apres la seance","Chemin pilote: les athletes se connectent, suivent les blocs, puis le coach lit les resultats.",week.id,coach.id]);
  const dryland = await findOrCreateBlock(session.id,"DRYLAND","Dryland pilote",20,1,51);
  await assignBlock(dryland.id,athletes.map(a=>a.id));
  const drylandItems=[[exercises[0].id,3,null,30,1],[exercises[1].id,3,6,null,2],[exercises[2].id,3,8,null,3]] as const;
  for(const [exerciseId,sets,reps,duration,order] of drylandItems) await pool.query(`INSERT INTO "DrylandBlockExercise" ("blockId","exerciseId",sets,reps,duration,"order") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("blockId","order") DO NOTHING`,[dryland.id,exerciseId,sets,reps,duration,order]);

  const poolBlock = await findOrCreateBlock(session.id,"POOL","Piscine pilote - arriere",45,2,27);
  await assignBlock(poolBlock.id,athletes.map(a=>a.id));
  await pool.query(`INSERT INTO "PoolTraining" ("blockId") VALUES ($1) ON CONFLICT ("blockId") DO NOTHING`,[poolBlock.id]);
  const oneMeter=await findOrCreateSection(poolBlock.id,"ONE_METER","1 metre",0),threeMeter=await findOrCreateSection(poolBlock.id,"THREE_METER","3 metres",1);
  for(const [section,dives] of [[oneMeter,[["101C","Avant groupe","C",3],["201C","Arriere groupe","C",4],["201B","Arriere carpe","B",4]]],[threeMeter,[["203C","Un et demi arriere","C",4],["301C","Retour groupe","C",4],["401B","Renverse carpe","B",3]]]] as const) for(const [order,[code,name,position,repetitions]] of dives.entries()) await createDive(section.id,code,name,position,repetitions,order+1);
  await pool.query(`INSERT INTO "SessionTemplate" (id,name,category,"clubId","sessionId",favorite,payload) VALUES ($1,$2,'Pilote',$3,$4,true,$5::jsonb) ON CONFLICT (id) DO UPDATE SET favorite=true,payload=EXCLUDED.payload`,[`${session.id}-pilot-template`,"Pilote lundi - pret a reutiliser",club.id,session.id,JSON.stringify({source:"seed-pilot",focus:session.focus})]);
  console.log(`Seed pilote pret pour ${nextMonday.toISOString().slice(0,10)}.`);
  console.log(`Coach: coach.pilote@diveplan.local / ${pilotPassword}`);
  console.log(`Athletes: emma.pilote@diveplan.local, leo.pilote@diveplan.local, mia.pilote@diveplan.local / ${pilotPassword}`);
}

async function findOrCreate(selectSql:string, selectValues:unknown[], insertSql:string, insertValues:unknown[]) {
  const found=await pool.query<{id:string;focus?:string}>(selectSql,selectValues);
  if(found.rows[0])return found.rows[0];
  return (await pool.query<{id:string;focus?:string}>(insertSql,insertValues)).rows[0];
}
async function upsertAthlete(firstName:string,lastName:string,email:string,level:string,clubId:string,groupId:string,passwordHash:string){
  const user=(await pool.query<{id:string}>(`INSERT INTO "User" (id,"firstName","lastName",email,role,"clubId","passwordHash","passwordSetAt") VALUES ($1,$2,$3,$4,'ATHLETE',$5,$6,NOW()) ON CONFLICT (email) DO UPDATE SET "firstName"=EXCLUDED."firstName","lastName"=EXCLUDED."lastName",role='ATHLETE',"clubId"=EXCLUDED."clubId","passwordHash"=EXCLUDED."passwordHash","passwordSetAt"=NOW() RETURNING id`,[id(),firstName,lastName,email,clubId,passwordHash])).rows[0];
  return (await pool.query<{id:string}>(`INSERT INTO "Athlete" (id,"userId","clubId","groupId","birthDate",level,active) VALUES ($1,$2,$3,$4,'2010-01-01',$5,true) ON CONFLICT ("userId") DO UPDATE SET "clubId"=EXCLUDED."clubId","groupId"=EXCLUDED."groupId",level=EXCLUDED.level,active=true RETURNING id`,[id(),user.id,clubId,groupId,level])).rows[0];
}
async function findOrCreateExercise(d:{name:string;category:string;description:string;defaultSets:number;defaultReps?:number;defaultDuration?:number;equipment:string;tags:string[]}){const found=await pool.query<{id:string}>(`SELECT id FROM "DrylandExercise" WHERE name=$1 LIMIT 1`,[d.name]);if(found.rows[0])return found.rows[0];return (await pool.query<{id:string}>(`INSERT INTO "DrylandExercise" (id,name,category,description,"defaultSets","defaultReps","defaultDuration",equipment,tags,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING id`,[id(),d.name,d.category,d.description,d.defaultSets,d.defaultReps??null,d.defaultDuration??null,d.equipment,d.tags])).rows[0];}
async function findOrCreateBlock(sessionId:string,type:string,title:string,duration:number,position:number,volume:number){const found=await pool.query<{id:string}>(`SELECT id FROM "SessionBlock" WHERE "sessionId"=$1 AND title=$2 LIMIT 1`,[sessionId,title]);if(found.rows[0])return found.rows[0];return (await pool.query<{id:string}>(`INSERT INTO "SessionBlock" (id,"sessionId",type,title,duration,position,"estimatedVolume") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[id(),sessionId,type,title,duration,position,volume])).rows[0];}
async function assignBlock(blockId:string,athleteIds:string[]){for(const athleteId of athleteIds)await pool.query(`INSERT INTO "SessionBlockAssignment" (id,"sessionBlockId","athleteId") VALUES ($1,$2,$3) ON CONFLICT ("sessionBlockId","athleteId") DO NOTHING`,[id(),blockId,athleteId]);}
async function findOrCreateSection(poolTrainingId:string,height:string,label:string,order:number){const found=await pool.query<{id:string}>(`SELECT id FROM "PoolSection" WHERE "poolTrainingId"=$1 AND height=$2 LIMIT 1`,[poolTrainingId,height]);if(found.rows[0])return found.rows[0];return (await pool.query<{id:string}>(`INSERT INTO "PoolSection" (id,"poolTrainingId",height,label,"order") VALUES ($1,$2,$3,$4,$5) RETURNING id`,[id(),poolTrainingId,height,label,order])).rows[0];}
async function createDive(sectionId:string,code:string,name:string,position:string,repetitions:number,order:number){const existing=await pool.query(`SELECT 1 FROM "PoolDive" WHERE "poolSectionId"=$1 AND "diveCode"=$2 AND "order"=$3 LIMIT 1`,[sectionId,code,order]);if(existing.rowCount)return;await pool.query(`INSERT INTO "PoolDive" (id,"poolSectionId","diveCode","diveName",position,repetitions,"order") VALUES ($1,$2,$3,$4,$5,$6,$7)`,[id(),sectionId,code,name,position,repetitions,order]);}
function getNextMonday(){const d=new Date();d.setHours(0,0,0,0);const day=d.getDay()||7;d.setDate(d.getDate()+(day===1?7:8-day));return d;}
function withTime(date:Date,hours:number,minutes:number){const next=new Date(date);next.setHours(hours,minutes,0,0);return next;}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>pool.end());
