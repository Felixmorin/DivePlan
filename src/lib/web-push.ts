import "server-only";

import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import type { PoolClient } from "pg";
import { pool, query } from "@/lib/db";
import { validatePushEndpoint } from "@/lib/push-endpoint";

let configured = false;
function configurePush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("Web Push VAPID keys are not configured");
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@diveplan.app", publicKey, privateKey);
    configured = true;
  }
}

export function isAutomaticSessionPushEnabled() {
  return process.env.WEB_PUSH_SESSION_PUBLISHED === "true";
}

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };
async function send(row: SubscriptionRow, payload: object) {
  if (!validatePushEndpoint(row.endpoint)) {
    await query(`DELETE FROM "PushSubscription" WHERE id=$1`, [row.id]);
    return "expired" as const;
  }
  configurePush();
  try {
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } } satisfies WebPushSubscription, JSON.stringify(payload), { TTL: 60 });
    return "sent" as const;
  } catch (error) {
    const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
    if (status === 404 || status === 410) {
      await query(`DELETE FROM "PushSubscription" WHERE id=$1`, [row.id]);
      return "expired" as const;
    }
    throw new Error(`push_provider_${status || "unknown"}`);
  }
}

export async function saveSessionPublicationTargets(tx: PoolClient, sessionId: string) {
  await tx.query("SAVEPOINT web_push_targets");
  try {
    await tx.query(
      `INSERT INTO "PushDelivery" (id,"sessionId","userId")
     SELECT gen_random_uuid()::text, $1, u.id
     FROM "TrainingSession" s
     JOIN "TrainingWeek" w ON w.id=s."weekId"
     JOIN "SessionBlock" b ON b."sessionId"=s.id
     JOIN "SessionBlockAssignment" a ON a."sessionBlockId"=b.id
     JOIN "Athlete" athlete ON athlete.id=a."athleteId" AND athlete.active=true AND athlete."clubId"=w."clubId"
     JOIN "User" u ON u.id=athlete."userId" AND u.role='ATHLETE'
     WHERE s.id=$1
       ON CONFLICT ("sessionId","userId") DO NOTHING`, [sessionId]
    );
    await tx.query("RELEASE SAVEPOINT web_push_targets");
  } catch {
    // The core session transaction must survive an unavailable push queue/table.
    await tx.query("ROLLBACK TO SAVEPOINT web_push_targets");
    await tx.query("RELEASE SAVEPOINT web_push_targets");
  }
}

export async function dispatchSessionPublication(sessionId: string) {
  if (!isAutomaticSessionPushEnabled()) return;
  const deliveries = (await query<{ id: string; userId: string }>(
    `SELECT id,"userId" FROM "PushDelivery" WHERE "sessionId"=$1 AND status='PENDING' ORDER BY id`, [sessionId]
  )).rows;
  for (const delivery of deliveries) {
    try {
      const subscriptions = (await query<SubscriptionRow>(`SELECT id,endpoint,p256dh,auth FROM "PushSubscription" WHERE "userId"=$1`, [delivery.userId])).rows;
      let accepted = 0;
      for (const subscription of subscriptions) {
        try {
          if (await send(subscription, { title: "Nouvelle séance disponible", body: "Ta séance est prête.", url: `/athlete/session/${encodeURIComponent(sessionId)}` }) === "sent") accepted++;
        } catch { /* A push provider failure must not roll back publishing. */ }
      }
      await query(`UPDATE "PushDelivery" SET status=$1, attempts=attempts+1, "sentAt"=CASE WHEN $1='SENT' THEN NOW() ELSE "sentAt" END, "lastError"=$2 WHERE id=$3 AND status='PENDING'`, [accepted ? "SENT" : "FAILED", accepted ? null : subscriptions.length ? "Push provider delivery failed" : "No active device subscription", delivery.id]);
    } catch {
      await query(`UPDATE "PushDelivery" SET status='FAILED', attempts=attempts+1, "lastError"='Delivery processing failed' WHERE id=$1 AND status='PENDING'`, [delivery.id]).catch(() => undefined);
    }
  }
}

export async function sendDeviceTest(userId: string, endpoint: string) {
  const result = await pool.connect();
  try {
    await result.query("BEGIN");
    const selected = await result.query<SubscriptionRow>(
      `UPDATE "PushSubscription" SET "lastTestAt"=NOW() WHERE "userId"=$1 AND endpoint=$2 AND ("lastTestAt" IS NULL OR "lastTestAt" < NOW()-INTERVAL '30 seconds') RETURNING id,endpoint,p256dh,auth`, [userId, endpoint]
    );
    if (!selected.rowCount) {
      const owned = await result.query(`SELECT 1 FROM "PushSubscription" WHERE "userId"=$1 AND endpoint=$2`, [userId, endpoint]);
      await result.query("ROLLBACK");
      return owned.rowCount ? "rate_limited" as const : "not_found" as const;
    }
    await result.query("COMMIT");
    try {
      const result = await send(selected.rows[0], { title: "DivePlan", body: "Les notifications sont activées sur cet appareil.", url: "/" });
      return result === "sent" ? "accepted" as const : result === "expired" ? "expired" as const : "failed" as const;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "push_provider_unknown";
      return reason.startsWith("push_provider_") ? reason as `push_provider_${string}` : "failed" as const;
    }
  } catch (error) {
    await result.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { result.release(); }
}

