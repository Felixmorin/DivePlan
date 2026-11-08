import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { createElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import * as timezone from "./timezone";
import { avatarUrlForPage } from "./avatar";

const paths = ["src/app/coach/athletes/page.tsx", "src/app/coach/groups/page.tsx", "src/app/coach/groups/[id]/page.tsx"];
function withoutAvatars(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAvatars);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "avatar").map(([key,v]) => [key,withoutAvatars(v)]));
  return value;
}

test("coach directory and group pages omit disabled photos from SQL while retaining their rendered data", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "User" (id text PRIMARY KEY,"firstName" text,"lastName" text,avatar text);
      CREATE TABLE "Coach" (id text PRIMARY KEY,"userId" text,"clubId" text);
      CREATE TABLE "TrainingGroup" (id text PRIMARY KEY,name text,"coachId" text,"clubId" text);
      CREATE TABLE "Athlete" (id text PRIMARY KEY,"userId" text,"clubId" text,"groupId" text,"birthDate" date,level text,active boolean);
      CREATE TABLE "TrainingWeek" (id text PRIMARY KEY,"clubId" text,"groupId" text);
      CREATE TABLE "TrainingSession" (id text PRIMARY KEY,"weekId" text,title text,date timestamptz,duration int,status text);
      CREATE TABLE "AthleteSessionCompletion" ("athleteId" text,"sessionId" text,status text,"startedAt" timestamptz,"completedAt" timestamptz);
      CREATE TABLE "AthleteDiveLog" ("athleteId" text,"sessionId" text,"repetitionsCompleted" int);
      CREATE VIEW "AthleteDiveRepetition" AS SELECT * FROM "AthleteDiveLog";
      CREATE TABLE "SessionBlock" (id text PRIMARY KEY,"sessionId" text);
      CREATE TABLE "SessionBlockAssignment" ("sessionBlockId" text,"athleteId" text);
      INSERT INTO "User" VALUES ('coach-user','Synthetic','Coach',NULL),('foreign-user','Foreign','Athlete',repeat('X',128000));
      INSERT INTO "Coach" VALUES ('coach','coach-user','club-a');
      INSERT INTO "TrainingGroup" VALUES ('group-a','Synthetic group','coach','club-a'),('empty','Empty group','coach','club-a'),('group-b','Foreign group','coach','club-b');
      INSERT INTO "TrainingWeek" VALUES ('week-a','club-a','group-a'),('week-b','club-b','group-b');
      INSERT INTO "TrainingSession" VALUES ('session-a','week-a','Synthetic session','2026-12-01',90,'READY'),('session-b','week-b','Foreign session','2026-12-01',60,'READY');
      INSERT INTO "User" SELECT 'user-'||n,'Athlete '||lpad(n::text,2,'0'),'Test',
        CASE WHEN n<=20 THEN 'data:image/png;base64,'||repeat('A',128000) WHEN n<=25 THEN 'https://example.test/photo-'||n ELSE NULL END FROM generate_series(1,30) n;
      INSERT INTO "Athlete" SELECT 'athlete-'||n,'user-'||n,'club-a','group-a','2010-01-01','Provincial',true FROM generate_series(1,30) n;
      INSERT INTO "Athlete" VALUES ('foreign','foreign-user','club-b','group-b',NULL,'Other',true);
      INSERT INTO "AthleteSessionCompletion" SELECT 'athlete-'||n,'session-a',CASE WHEN n=1 THEN 'IN_PROGRESS' ELSE 'COMPLETED' END,'2026-11-01','2026-11-01' FROM generate_series(1,30) n;
      INSERT INTO "AthleteDiveLog" SELECT 'athlete-'||n,'session-a',n FROM generate_series(1,30) n;
      INSERT INTO "SessionBlock" VALUES ('block','session-a');
      INSERT INTO "SessionBlockAssignment" SELECT 'block','athlete-'||n FROM generate_series(1,30) n;`);
    let clubId = "club-a"; let authorized = true; let legacy = false;
    let queries = 0; let bytes = 0; let results: unknown[] = [];
    let queue = Promise.resolve();
    const query = (text: string, args: unknown[]) => {
      const sql = legacy ? text.replace(/NULL::text AS avatar/g, "u.avatar").replace(/'avatar', NULL/g, "'avatar', au.avatar") : text;
      queries++;
      const result = queue.then(async () => {
        const response = await db.query(sql,args); bytes += Buffer.byteLength(JSON.stringify(response.rows));
        results.push(JSON.parse(JSON.stringify(response.rows))); return response;
      });
      queue = result.then(() => undefined, () => undefined); return result;
    };
    const wrap = ({ children }: {children?:ReactNode}) => createElement("div", null, children);
    const data = (props: unknown) => createElement("pre", null, JSON.stringify(props));
    const fallback = new Proxy({}, { get: () => wrap });
    const avatarExports: Partial<typeof import("./avatar-storage")> = {};
    runInNewContext(ts.transpileModule(readFileSync("src/lib/avatar-storage.ts","utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText, { exports: avatarExports, require: (name: string) => { assert.equal(name,"server-only"); return {}; } });
    const resolveAvatarUrls = avatarExports.resolveAvatarUrls!;
    const dependencies: Record<string, unknown> = {
      "react/jsx-runtime": jsx, "lucide-react": icons,
      "@/lib/current-user": { requireCoach: async () => { if (!authorized) throw new Error("FORBIDDEN"); return { clubId }; } },
      "@/lib/db": { query }, "@/lib/avatar-storage": { resolveAvatarUrls }, "@/lib/avatar": { avatarUrlForPage },
      "@/lib/timezone": timezone, "@/lib/data": { athletes: [], demoSession: {} },
      "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
      "@/components/ui/app-link": { __esModule: true, default: ({children,href}: {children:ReactNode;href:string}) => createElement("a",{href},children) },
      "@/app/coach/athletes/athlete-directory": { AthleteDirectory: data },
      "@/components/coach/athlete-avatars": { AthleteAvatars: data },
      "@/components/coach/athlete-avatar-group": { AthleteAvatarGroup: data },
      "@/components/ui/avatar": { Avatar: wrap, AvatarFallback: wrap, AvatarImage: () => null },
      "@/app/coach/groups/actions": { createTrainingGroup: async () => {}, assignAthletesToGroup: async () => {} }
    };
    const pages = paths.map(path => {
      const exports: { default?: (props: {params:Promise<{id:string}>}) => Promise<ReactNode> } = {};
      runInNewContext(ts.transpileModule(readFileSync(path,"utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
      }).outputText, { exports, Date, Map, Set, require: (name: string) => dependencies[name] ?? fallback });
      return exports.default!;
    });
    const reset = () => { queries = 0; bytes = 0; results = []; };
    for (let i=0;i<pages.length;i++) {
      await t.test(paths[i], async () => {
        reset(); legacy = true;
        const before = renderToStaticMarkup(await pages[i]({ params: Promise.resolve({ id: "group-a" }) }));
        const beforeBytes = bytes; const beforeQueries = queries; const beforeData = withoutAvatars(results);
        reset(); legacy = false;
        const after = renderToStaticMarkup(await pages[i]({ params: Promise.resolve({ id: "group-a" }) }));
        assert.equal(after, before, "server markup and client props retain names, levels, statuses, selection and volumes");
        assert.deepEqual(withoutAvatars(results), beforeData);
        assert.equal(queries, beforeQueries);
        assert.ok(!JSON.stringify(results).includes("data:image"), "disabled inline photos never cross the SQL result boundary");
        assert.ok(bytes < beforeBytes / 20, "same rows without the synthetic images");
        assert.doesNotMatch(after, /Foreign|data:image|example.test/);
        t.diagnostic(`${paths[i]} synthetic SQL rows in JSON: ${beforeBytes} -> ${bytes} bytes; queries ${beforeQueries} -> ${queries}. No HTTP/FOT/latency measurement.`);
      });
    }
    await t.test("club filtering, empty groups and denied access are retained", async () => {
      const empty = renderToStaticMarkup(await pages[2]({ params: Promise.resolve({ id: "empty" }) }));
      assert.match(empty,/Empty group/); assert.doesNotMatch(empty,/Athlete 01/);
      clubId = "club-b";
      await assert.rejects(pages[2]({ params: Promise.resolve({ id: "group-a" }) }), /NOT_FOUND/);
      const other = renderToStaticMarkup(await pages[0]({ params: Promise.resolve({ id: "unused" }) }));
      assert.match(other,/Foreign/); assert.doesNotMatch(other,/Athlete 01/);
      authorized = false; reset();
      for (const page of pages) await assert.rejects(page({ params: Promise.resolve({ id: "group-a" }) }), /FORBIDDEN/);
      assert.equal(queries,0);
    });
  } finally { await db.close(); }
});
