import { SENTRY_ENABLED, sentryOptions } from "@/lib/sentry";

// Browser error tracking. The SDK is code-split behind the DSN check, so a deployment without Sentry never
// downloads it (docs/DEPLOYMENT.md → Error tracking).
if (SENTRY_ENABLED) void import("@sentry/nextjs").then((Sentry) => Sentry.init(sentryOptions("client")));
