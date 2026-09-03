import { DEFAULT_ENDPOINT, EVENTS_PATH, type LifecycleEvent, type LifecycleEventType, type NativeSource, PROTOCOL_VERSION, pseudonymize, randomId, signedHeaders } from "@usertrack/protocol";
import { SDK_VERSION } from "./version.js";

export type Log = (message: string, meta?: Record<string, unknown>) => void;

export type TrackerOptions = {
  /** UserTrack project id (Dashboard → project → Integrations). */
  projectId: string;
  /** Integration secret (`ut_int_…`). Generated once by UserTrack; keep it in an env var. */
  secret: string;
  /** UserTrack base URL. Defaults to https://usertrack.dev — only change it for self-hosted UserTrack. */
  endpoint?: string;
  /** Which SDK adapter produced the data (shown in the UserTrack dashboard). Default "custom". */
  source?: NativeSource;
  /** Log delivery problems (true → console.warn, or your own logger). Default off. */
  debug?: boolean | Log;
  timeoutMs?: number;
  fetch?: typeof fetch;
  clientVersion?: string;
};

export type TrackSubject = { id: string; at?: Date | string | number };

export type Tracker = {
  /** Fire-and-forget: never throws, never awaits network I/O in the caller. */
  track(type: LifecycleEventType, subject: TrackSubject): void;
  /** Same as track, but resolves with the delivery result (for tests and job runners). Never throws. */
  deliver(type: LifecycleEventType, subject: TrackSubject): Promise<boolean>;
};

export function required(value: unknown, name: string, pkg = "@usertrack/node"): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${pkg}: "${name}" is required. Create the integration in UserTrack and set it from an environment variable.`);
  return value.trim();
}

export const resolveLog = (debug: boolean | Log | undefined, prefix = "[usertrack]"): Log | undefined => (typeof debug === "function" ? debug : debug ? (m, meta) => console.warn(`${prefix} ${m}`, meta ?? {}) : undefined);

export async function buildEvent(t: { projectId: string; secret: string; source: NativeSource; clientVersion: string }, type: LifecycleEventType, subject: TrackSubject): Promise<LifecycleEvent> {
  const at = subject.at === undefined ? new Date() : subject.at instanceof Date ? subject.at : new Date(subject.at);
  return {
    protocolVersion: PROTOCOL_VERSION,
    clientVersion: t.clientVersion,
    source: t.source,
    projectId: t.projectId,
    eventId: randomId(),
    type,
    subject: await pseudonymize(t.secret, String(subject.id)),
    occurredAt: (Number.isNaN(at.getTime()) ? new Date() : at).toISOString(),
  };
}

export type EventTransport = { endpoint: string; projectId: string; secret: string; timeoutMs?: number; fetch?: typeof fetch; log?: Log | undefined; userAgent?: string };

/** Delivers one signed event. Never throws: UserTrack availability must not affect the host app. */
export async function deliverEvent(t: EventTransport, event: LifecycleEvent): Promise<boolean> {
  const doFetch = t.fetch ?? globalThis.fetch;
  const body = JSON.stringify(event);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), t.timeoutMs ?? 3000);
  try {
    const headers = await signedHeaders(t.secret, t.projectId, { method: "REQUEST", path: EVENTS_PATH, body });
    const res = await doFetch(`${t.endpoint.replace(/\/$/, "")}${EVENTS_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": t.userAgent ?? `usertrack-node/${SDK_VERSION}`, ...headers },
      body,
      signal: controller.signal,
    });
    if (!res.ok) t.log?.(`event ${event.type} rejected by UserTrack`, { status: res.status, eventId: event.eventId });
    return res.ok;
  } catch (err) {
    t.log?.(`event ${event.type} not delivered`, { eventId: event.eventId, error: err instanceof Error ? err.message : String(err) });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Push client shared by every adapter: `track("user.created", { id })` after your own write succeeded. */
export function createTracker(options: TrackerOptions): Tracker {
  const projectId = required(options.projectId, "projectId");
  const secret = required(options.secret, "secret");
  const endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "");
  const source = options.source ?? "custom";
  const clientVersion = options.clientVersion ?? SDK_VERSION;
  const log = resolveLog(options.debug);
  const transport: EventTransport = { endpoint, projectId, secret, log, ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}), ...(options.fetch ? { fetch: options.fetch } : {}) };
  const deliver = (type: LifecycleEventType, subject: TrackSubject) => {
    if (!subject || subject.id === undefined || subject.id === null || String(subject.id) === "") return Promise.resolve(false);
    return buildEvent({ projectId, secret, source, clientVersion }, type, subject).then((e) => deliverEvent(transport, e)).catch(() => false);
  };
  return { track: (type, subject) => void deliver(type, subject), deliver };
}
