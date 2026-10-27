import { NextResponse, type NextRequest } from "next/server";
import { resourcePath } from "@/lib/request-observation";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Overwrite the client value: downstream code trusts this normalized path as server-generated context.
  requestHeaders.set("x-diveplan-route", resourcePath(request.nextUrl.pathname) ?? "/");
  const requestId = crypto.randomUUID();
  const prefetch = request.headers.get("next-router-prefetch") === "1" || request.headers.has("next-router-segment-prefetch") || /prefetch/i.test(request.headers.get("purpose") ?? request.headers.get("sec-purpose") ?? "");
  const trigger = prefetch ? "prefetch" : request.headers.has("next-action") ? "action" : request.nextUrl.pathname.startsWith("/api/") ? "api" : "navigation";
  requestHeaders.set("x-diveplan-request-id",requestId);
  requestHeaders.set("x-diveplan-trigger",trigger);
  requestHeaders.delete("x-diveplan-page-route");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Same-origin Resource Timing exposes this opaque correlation id to the collector.
  response.headers.append("Server-Timing",`dp;desc="${requestId}"`);
  return response;
}

export const config = {
  // Also overwrite spoofed telemetry headers on public auth pages. Static assets
  // do not call the database and can bypass this context.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|manifest.webmanifest|icons/).*)"]
};
