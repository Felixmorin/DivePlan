import { NextResponse, type NextRequest } from "next/server";
import { normalizeTelemetryRoute } from "@/lib/telemetry-route";

/** Pass a normalized page path to server-side SQL telemetry for this request. */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-diveplan-page-route", normalizeTelemetryRoute(request.nextUrl.pathname) ?? "");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)"]
};
