import { ERROR_CODES, type ErrorCode, HEADER_PROJECT, type HeaderReader, METRICS_PATH, type MetricsRequest, type NativeSource, NonceCache, PROTOCOL_VERSION, readHeader, signedHeaders, timingSafeEqual, verify } from "@usertrack/protocol";
import { collectMetrics, MetricsError } from "./collect.js";
import type { ConversionSource, CountSource, Sources } from "./sources.js";
import { type Log, required, resolveLog } from "./track.js";
import { SDK_VERSION } from "./version.js";

export type HandlerOptions = {
  projectId: string;
  secret: string;
  /** Registered users: `count({ createdAtGte?, createdAtLt? })`. Required — this is the Signed up stage. */
  users: CountSource;
  /** Activated users (reached the first meaningful value). Optional. */
  activation?: CountSource;
  /** Converted (paid) and trial users. Optional; conversion state only, never amounts. */
  conversion?: ConversionSource;
  identities?: Sources["identities"];
  /** Which adapter the data comes from. Default "custom". */
  source?: NativeSource;
  debug?: boolean | Log;
  clientVersion?: string;
  /** Test hook. */
  now?: () => number;
  nonces?: NonceCache;
};

export type MetricsCore = { projectId: string; secret: string; sources: Sources; source: NativeSource; clientVersion: string; nonces: NonceCache; log?: Log | undefined; now?: (() => number) | undefined; anonymousExcluded?: boolean };
export type HandlerResult = { status: number; body: string; headers: Record<string, string> };
export type UserTrackHandler = (req: Request) => Promise<Response>;

const fail = (status: number, code: ErrorCode, message: string = ERROR_CODES[code]): HandlerResult => ({ status, body: JSON.stringify({ code, message }), headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Framework-agnostic core: verifies the signed request, runs the sources, signs the response. Used by every adapter. */
export async function handleMetrics(core: MetricsCore, input: { headers: HeaderReader; body: string }): Promise<HandlerResult> {
  const claimed = readHeader(input.headers, HEADER_PROJECT) ?? "";
  if (!timingSafeEqual(claimed, core.projectId)) return fail(401, "USERTRACK_UNAUTHORIZED");
  const now = core.now?.();
  const v = await verify(core.secret, input.headers, { method: "REQUEST", path: METRICS_PATH, body: input.body }, now !== undefined ? { now } : {});
  if (!v.ok) return fail(401, v.reason === "stale" ? "USERTRACK_STALE_REQUEST" : "USERTRACK_UNAUTHORIZED");
  if (!core.nonces.use(v.nonce, now)) return fail(401, "USERTRACK_REPLAY");
  let request: MetricsRequest;
  try {
    request = input.body.trim() === "" ? { protocolVersion: PROTOCOL_VERSION } : (JSON.parse(input.body) as MetricsRequest);
  } catch {
    return fail(400, "USERTRACK_BAD_REQUEST");
  }
  if (!request || typeof request !== "object") return fail(400, "USERTRACK_BAD_REQUEST");
  if (request.protocolVersion !== undefined && Number(request.protocolVersion) !== PROTOCOL_VERSION) return fail(400, "USERTRACK_BAD_REQUEST", `Unsupported protocolVersion ${String(request.protocolVersion)}; this client speaks v${PROTOCOL_VERSION}`);
  let body: string;
  try {
    const metrics = await collectMetrics(core.sources, request, { projectId: core.projectId, source: core.source, clientVersion: core.clientVersion, ...(now !== undefined ? { now } : {}), ...(core.anonymousExcluded !== undefined ? { anonymousExcluded: core.anonymousExcluded } : {}) });
    body = JSON.stringify(metrics);
  } catch (err) {
    if (err instanceof MetricsError && err.code === "bad_request") return fail(400, "USERTRACK_BAD_REQUEST", err.message);
    core.log?.("metrics query failed", { error: err instanceof Error ? err.message : String(err) });
    return fail(500, "USERTRACK_SOURCE_ERROR");
  }
  const signed = await signedHeaders(core.secret, core.projectId, { method: "RESPONSE", path: METRICS_PATH, body, nonce: v.nonce });
  return { status: 200, body, headers: { "content-type": "application/json", "cache-control": "no-store", ...signed } };
}

export function coreFromOptions(options: HandlerOptions, pkg = "@usertrack/node"): MetricsCore {
  const projectId = required(options.projectId, "projectId", pkg);
  const secret = required(options.secret, "secret", pkg);
  if (!options.users || typeof options.users.count !== "function") throw new Error(`${pkg}: "users" must be a count source, e.g. prismaUsers(prisma.user) or { count: async (where) => … }.`);
  const sources: Sources = { users: options.users, ...(options.activation ? { activation: options.activation } : {}), ...(options.conversion ? { conversion: options.conversion } : {}), ...(options.identities ? { identities: options.identities } : {}) };
  return { projectId, secret, sources, source: options.source ?? "custom", clientVersion: options.clientVersion ?? SDK_VERSION, nonces: options.nonces ?? new NonceCache(), log: resolveLog(options.debug), now: options.now };
}

export const toResponse = (r: HandlerResult) => new Response(r.body, { status: r.status, headers: r.headers });

/**
 * WHATWG fetch handler for `POST …/usertrack/metrics`. Works as a Next.js route export, in Hono, Remix, Bun,
 * Cloudflare Workers and (via toNodeHandler) Express / plain Node http.
 */
export function createUserTrackHandler(options: HandlerOptions): UserTrackHandler {
  const core = coreFromOptions(options);
  return async (req: Request) => {
    if (req.method !== "POST") return new Response(JSON.stringify({ code: "USERTRACK_BAD_REQUEST", message: "POST signed metrics requests here" }), { status: 405, headers: { "content-type": "application/json", allow: "POST" } });
    return toResponse(await handleMetrics(core, { headers: req.headers, body: await req.text() }));
  };
}
