import type { ErrorEvent, TransactionEvent } from "@sentry/core";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SECRET = /\b(?:password|passwd|token|secret|api[_-]?key|authorization)(\s*[:=]\s*)[^\s,;]+/gi;
const QUERY = /([?#])[^\s)"']+/g;
const DYNAMIC_SEGMENT = /\/(?:[0-9]+|[0-9a-f]{8}-[0-9a-f-]{27,}|[a-z0-9_-]{20,})(?=\/|\b)/gi;

function scrubString(value: string): string {
  return value
    .replace(EMAIL, "[redacted-email]")
    .replace(SECRET, "$1[redacted]")
    .replace(QUERY, "$1[redacted]")
    .replace(DYNAMIC_SEGMENT, "/:id");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/(?:header|cookie|authorization|password|passwd|token|secret|credential|request[_-]?body)/i.test(key))
      .map(([key, item]) => [key, scrubValue(item)]));
  }
  return value;
}

function scrubRequest(event: ErrorEvent | TransactionEvent) {
  event.user = undefined;
  event.request = undefined;
  event.breadcrumbs = undefined;
  event.extra = undefined;
  event.contexts = undefined;
  event.tags = event.tags ? scrubValue(event.tags) as Record<string, string> : undefined;
  event.fingerprint = event.fingerprint?.map(scrubString);
  if (event.message) event.message = scrubString(event.message);
  if (event.logentry?.message) event.logentry.message = scrubString(event.logentry.message);
  if (event.logentry?.params) event.logentry.params = event.logentry.params.map(scrubValue);
  if (event.exception?.values) {
    for (const exception of event.exception.values) {
      if (exception.value) exception.value = scrubString(exception.value);
      if (exception.stacktrace?.frames) {
        for (const frame of exception.stacktrace.frames) {
          if (frame.filename) frame.filename = scrubString(frame.filename);
          if (frame.abs_path) frame.abs_path = scrubString(frame.abs_path);
          if (frame.vars) frame.vars = undefined;
        }
      }
    }
  }
  if (event.transaction) event.transaction = scrubString(event.transaction);
  if (event.spans) {
    for (const span of event.spans) {
      if (span.description) span.description = scrubString(span.description);
      if (span.data) span.data = scrubValue(span.data) as typeof span.data;
    }
  }
}

export function sanitizeErrorEvent(event: ErrorEvent): ErrorEvent | null {
  scrubRequest(event);
  return event;
}

export function sanitizeTransactionEvent(event: TransactionEvent): TransactionEvent | null {
  scrubRequest(event);
  return event;
}
