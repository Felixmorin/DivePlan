import * as Sentry from "@sentry/nextjs";
import { sanitizeErrorEvent, sanitizeTransactionEvent } from "./src/lib/sentry-privacy";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production" && Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  beforeSend: sanitizeErrorEvent,
  beforeSendTransaction: sanitizeTransactionEvent,
});
