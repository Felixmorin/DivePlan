import { NextResponse, type NextRequest } from "next/server";
import { normalizeTelemetryRoute } from "@/lib/telemetry-route";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Overwrite the client value: downstream code trusts this normalized path as server-generated context.
  requestHeaders.set("x-diveplan-route", normalizeTelemetryRoute(request.nextUrl.pathname) ?? "/");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/coach/:path*", "/athlete/:path*", "/admin/:path*", "/api/:path*"]
};
