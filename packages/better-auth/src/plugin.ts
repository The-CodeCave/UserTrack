import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { handleMetrics, type MetricsCore } from "@usertrack/node";
import { DEFAULT_ENDPOINT, METRICS_PATH, NonceCache } from "@usertrack/protocol";
import { betterAuthTracker } from "./events.js";
import { betterAuthUsers, type UserStore } from "./metrics.js";
import { PLUGIN_VERSION } from "./version.js";

export type UserTrackPluginOptions = {
  /** UserTrack project id (Dashboard → project → Integrations → Better Auth). */
  projectId: string;
  /** Integration secret (`ut_int_…`). Generated once by UserTrack; keep it in an env var. */
  secret: string;
  /** UserTrack base URL. Defaults to https://usertrack.dev — only change it for self-hosted UserTrack. */
  endpoint?: string;
  /** Push `user.created` / `user.deleted` lifecycle events (fire-and-forget). Default true. */
  events?: boolean;
  /** Log delivery problems through the Better Auth logger. Default false. */
  debug?: boolean;
};

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`@usertrack/better-auth: "${name}" is required. Create the integration in UserTrack and set it from an environment variable.`);
  return value.trim();
}

export function userTrack(options: UserTrackPluginOptions) {
  const projectId = required(options.projectId, "projectId");
  const secret = required(options.secret, "secret");
  const endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "");
  const events = options.events ?? true;
  const nonces = new NonceCache();
  type Logger = { warn?: (...a: unknown[]) => void; error?: (...a: unknown[]) => void } | undefined;
  const log = (logger: Logger) => (options.debug ? (msg: string, meta?: Record<string, unknown>) => logger?.warn?.(`[usertrack] ${msg}`, meta ?? {}) : undefined);

  const push = (ctx: { context: { logger?: Logger } } | null, type: "user.created" | "user.deleted", user: { id: string; createdAt?: Date | string }, at: Date) => {
    if (!events) return;
    const l = log(ctx?.context.logger);
    betterAuthTracker({ projectId, secret, endpoint, ...(l ? { debug: l } : {}) }).track(type, { id: user.id, at });
  };

  return {
    id: "usertrack",
    version: PLUGIN_VERSION,
    init() {
      return {
        options: {
          databaseHooks: {
            user: {
              create: { after: async (user, ctx) => push(ctx, "user.created", user, user.createdAt instanceof Date ? user.createdAt : new Date()) },
              delete: { after: async (user, ctx) => push(ctx, "user.deleted", user, new Date()) },
            },
          },
        },
      };
    },
    endpoints: {
      usertrackMetrics: createAuthEndpoint(
        METRICS_PATH,
        { method: "POST" },
        async (ctx) => {
          const headers = ctx.headers ?? new Headers();
          const rawBody = typeof ctx.body === "string" ? ctx.body : ctx.body === undefined || ctx.body === null ? "" : JSON.stringify(ctx.body);
          const excludeAnonymous = (ctx.context.options.plugins ?? []).some((p) => p.id === "anonymous");
          const core: MetricsCore = {
            projectId,
            secret,
            source: "better-auth",
            clientVersion: PLUGIN_VERSION,
            nonces,
            anonymousExcluded: excludeAnonymous,
            sources: { users: betterAuthUsers(ctx.context.adapter as unknown as UserStore, { excludeAnonymous }) },
            log: (msg, meta) => ctx.context.logger?.error?.(`[usertrack] ${msg}`, meta ?? {}),
          };
          const r = await handleMetrics(core, { headers, body: rawBody });
          return new Response(r.body, { status: r.status, headers: r.headers });
        },
      ),
    },
    rateLimit: [{ pathMatcher: (path) => path === METRICS_PATH, window: 60, max: 30 }],
    options: { projectId, endpoint, events },
  } satisfies BetterAuthPlugin;
}

export type UserTrackPlugin = ReturnType<typeof userTrack>;
