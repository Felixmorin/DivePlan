/** Normalize request paths before storing them so dynamic identifiers do not create high-cardinality telemetry. */
export function normalizeTelemetryRoute(pathname: string): string | null {
  if (pathname.length > 200 || !pathname.startsWith("/") || pathname.startsWith("//")) return null;
  const segments = pathname.split("/").filter(Boolean).map((segment) => {
    if (/^[0-9]+$/.test(segment) || /^[a-z0-9_-]{20,}$/i.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
    return segment.replace(/[^a-zA-Z0-9._~-]/g, "");
  });
  return `/${segments.join("/")}`.slice(0, 200);
}
