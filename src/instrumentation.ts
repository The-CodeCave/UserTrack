import type { Instrumentation } from "next";
import { SENTRY_ENABLED } from "@/lib/sentry";

// Server + edge error tracking. Both the SDK and its config are imported only when a DSN is configured.
export async function register() {
  if (!SENTRY_ENABLED) return;
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!SENTRY_ENABLED) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, context);
};
