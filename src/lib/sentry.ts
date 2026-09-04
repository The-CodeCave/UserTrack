// Error tracking (docs/DEPLOYMENT.md → Error tracking). Feature-flagged on the DSN: without it `Sentry.init` is
// never called and the SDK is never even imported, so a deployment without Sentry pays nothing.
// Nothing that could carry a secret leaves the process: request bodies, cookies, auth headers and `token` query
// parameters are stripped before an event is sent.

import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { APP_VERSION } from "./site";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";
export const SENTRY_ENABLED = SENTRY_DSN !== "" && process.env.NODE_ENV !== "test";
// Sentry EU ingest, needed in the CSP `connect-src` for the browser SDK.
export const SENTRY_INGEST_ORIGIN = "https://*.ingest.de.sentry.io";

const REDACTED = "[redacted]";
const DROP_HEADERS = ["authorization", "x-api-key", "cookie", "set-cookie", "x-ut-gateway-secret"];
const DROP_PARAMS = ["token", "state", "code", "secret"];

// `?token=…` links (email preferences, password reset) must never appear in an event, a breadcrumb or a URL.
export function scrubUrl(url: string): string {
  const [path, query] = url.split("?");
  if (!query) return path;
  const scrubbed = scrubQuery(query);
  return scrubbed ? `${path}?${scrubbed}` : path;
}

export function scrubQuery(query: string): string {
  const params = new URLSearchParams(query);
  for (const key of DROP_PARAMS) if (params.has(key)) params.set(key, REDACTED);
  return params.toString();
}

function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !DROP_HEADERS.includes(k.toLowerCase())));
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request) {
    delete request.data;
    delete request.cookies;
    if (request.headers) request.headers = scrubHeaders(request.headers);
    if (request.url) request.url = scrubUrl(request.url);
    if (typeof request.query_string === "string") request.query_string = scrubQuery(request.query_string);
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (typeof breadcrumb.data?.url === "string") breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
  return breadcrumb;
}

// Errors only — no tracing, no session replay, no PII.
export function sentryOptions(runtime: "client" | "server" | "edge") {
  return {
    dsn: SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
    release: APP_VERSION,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    maxValueLength: 500,
    initialScope: { tags: { runtime } },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
