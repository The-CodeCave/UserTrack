import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { buildEvent, deliverEvent } from "./events.js";
import { collectMetrics, MetricsError, type UserStore } from "./metrics.js";
import { DEFAULT_ENDPOINT, HEADER_PROJECT, METRICS_PATH, NonceCache, type MetricsRequest, PROTOCOL_VERSION, signedHeaders, timingSafeEqual, verify } from "./protocol.js";
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

const ERROR_CODES = {
  USERTRACK_UNAUTHORIZED: "UserTrack signature invalid",
  USERTRACK_STALE_REQUEST: "UserTrack request timestamp outside the accepted window",
  USERTRACK_REPLAY: "UserTrack request nonce already used",
  USERTRACK_BAD_REQUEST: "UserTrack metrics request is malformed",
  USERTRACK_ADAPTER_ERROR: "UserTrack could not count users with the configured database adapter",
} as const;

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
  const log = (logger: { warn?: (...a: unknown[]) => void } | undefined) => (options.debug ? (msg: string, meta?: Record<string, unknown>) => logger?.warn?.(`[usertrack] ${msg}`, meta ?? {}) : undefined);

  const push = (ctx: { context: { logger?: { warn?: (...a: unknown[]) => void } } } | null, type: "user.created" | "user.deleted", user: { id: string; createdAt?: Date | string }, at: Date) => {
    if (!events) return;
    const logger = ctx?.context.logger;
    void buildEvent({ projectId, secret }, type, user.id, at)
      .then((event) => deliverEvent({ endpoint, projectId, secret, log: log(logger) }, event))
      .catch(() => {});
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
          const rawBody = typeof ctx.body === "string" ? ctx.body : JSON.stringify(ctx.body ?? {});
          const claimed = headers.get(HEADER_PROJECT) ?? "";
          if (!timingSafeEqual(claimed, projectId)) throw new APIError("UNAUTHORIZED", { message: ERROR_CODES.USERTRACK_UNAUTHORIZED, code: "USERTRACK_UNAUTHORIZED" });
          const v = await verify(secret, headers, { method: "REQUEST", path: METRICS_PATH, body: rawBody });
          if (!v.ok) {
            if (v.reason === "stale") throw new APIError("UNAUTHORIZED", { message: ERROR_CODES.USERTRACK_STALE_REQUEST, code: "USERTRACK_STALE_REQUEST" });
            throw new APIError("UNAUTHORIZED", { message: ERROR_CODES.USERTRACK_UNAUTHORIZED, code: "USERTRACK_UNAUTHORIZED" });
          }
          if (!nonces.use(v.nonce!)) throw new APIError("UNAUTHORIZED", { message: ERROR_CODES.USERTRACK_REPLAY, code: "USERTRACK_REPLAY" });

          let request: MetricsRequest;
          try {
            request = (typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body) ?? { protocolVersion: PROTOCOL_VERSION };
          } catch {
            throw new APIError("BAD_REQUEST", { message: ERROR_CODES.USERTRACK_BAD_REQUEST, code: "USERTRACK_BAD_REQUEST" });
          }
          const excludeAnonymous = (ctx.context.options.plugins ?? []).some((p) => p.id === "anonymous");
          let body: string;
          try {
            const metrics = await collectMetrics(ctx.context.adapter as unknown as UserStore, request, { projectId, excludeAnonymous });
            body = JSON.stringify(metrics);
          } catch (err) {
            if (err instanceof MetricsError && err.code === "bad_request") throw new APIError("BAD_REQUEST", { message: err.message, code: "USERTRACK_BAD_REQUEST" });
            ctx.context.logger?.error?.("[usertrack] metrics query failed", err instanceof Error ? err.message : err);
            throw new APIError("INTERNAL_SERVER_ERROR", { message: ERROR_CODES.USERTRACK_ADAPTER_ERROR, code: "USERTRACK_ADAPTER_ERROR" });
          }
          const signed = await signedHeaders(secret, projectId, { method: "RESPONSE", path: METRICS_PATH, body, nonce: v.nonce! });
          return new Response(body, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", ...signed } });
        },
      ),
    },
    rateLimit: [{ pathMatcher: (path) => path === METRICS_PATH, window: 60, max: 30 }],
    options: { projectId, endpoint, events },
  } satisfies BetterAuthPlugin;
}

export type UserTrackPlugin = ReturnType<typeof userTrack>;
