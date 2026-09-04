import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import nextConfig from "../../next.config";
import { SENTRY_ENABLED, SENTRY_INGEST_ORIGIN, scrubEvent, scrubUrl, sentryOptions } from "./sentry";

const event = (request: ErrorEvent["request"], breadcrumbs?: Breadcrumb[]) => ({ type: undefined, request, breadcrumbs }) as ErrorEvent;

describe("sentry", () => {
  it("stays off without a DSN", () => {
    expect(process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").toBe("");
    expect(SENTRY_ENABLED).toBe(false);
  });

  it("never sends bodies, cookies or credential headers", () => {
    const scrubbed = scrubEvent(event({
      data: { password: "hunter2" },
      cookies: { session: "abc" },
      headers: { Authorization: "Bearer secret", "X-Api-Key": "ut_live_123", "user-agent": "curl" },
      url: "https://usertrack.dev/email/preferences",
    }));
    expect(scrubbed.request!.data).toBeUndefined();
    expect(scrubbed.request!.cookies).toBeUndefined();
    expect(scrubbed.request!.headers).toEqual({ "user-agent": "curl" });
  });

  it("redacts token-bearing query parameters in urls, query strings and breadcrumbs", () => {
    expect(scrubUrl("https://usertrack.dev/email/preferences?token=abc&type=digest")).toBe("https://usertrack.dev/email/preferences?token=%5Bredacted%5D&type=digest");
    expect(scrubUrl("https://usertrack.dev/leaderboard")).toBe("https://usertrack.dev/leaderboard");
    const scrubbed = scrubEvent(event({ url: "https://usertrack.dev/reset-password?token=t", query_string: "token=t&x=1" }, [{ data: { url: "https://usertrack.dev/x?secret=s" } }]));
    expect(scrubbed.request!.url).not.toContain("token=t");
    expect(scrubbed.request!.query_string).toBe("token=%5Bredacted%5D&x=1");
    expect(scrubbed.breadcrumbs![0].data!.url).not.toContain("secret=s");
  });

  it("collects errors only — no tracing, no PII", () => {
    const options = sentryOptions("server");
    expect(options.tracesSampleRate).toBe(0);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.initialScope.tags.runtime).toBe("server");
  });

  it("allows the Sentry EU ingest host in the CSP", async () => {
    const headers = await nextConfig.headers!();
    const csp = headers[0].headers.find((h) => h.key === "Content-Security-Policy")!.value as string;
    expect(csp).toContain(`connect-src`);
    expect(csp.split("; ").find((d) => d.startsWith("connect-src"))).toContain(SENTRY_INGEST_ORIGIN);
  });
});
