import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NODE_ENV !== "production" || !process.env.SENTRY_DSN) return;

  Sentry.captureException(error, {
    tags: {
      "next.router": context.routerKind,
      "next.route_type": context.routeType,
      "next.runtime": process.env.NEXT_RUNTIME ?? "unknown",
    },
    extra: { route: context.routePath },
  });
  await Sentry.flush(2_000);
};
