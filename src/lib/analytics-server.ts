// Server-side Rybbit events from Next.js route handlers: queued with `after()`, 2 s timeout, never throws, never logs the key.
import { after } from "next/server";
import { SITE_HOST } from "@/lib/site";
import { ANALYTICS_ENABLED, RYBBIT_HOST, RYBBIT_SITE_ID, cleanProps, type EventProps, type ServerEvents } from "./analytics";

const TIMEOUT_MS = 2_000;
const USER_AGENT = "UserTrack/1.0 (server)";

export type ServerEventInput = { host: string; siteId: string; apiKey?: string; hostname: string; pathname: string; event: string; props?: EventProps; userId?: string };

// POST /api/track (custom_event). Properties travel as a JSON string, as Rybbit's API expects.
export async function sendServerEvent(input: ServerEventInput, fetchImpl: typeof fetch = fetch) {
  const props = cleanProps(input.props);
  const body = {
    site_id: input.siteId,
    type: "custom_event",
    hostname: input.hostname,
    pathname: input.pathname,
    event_name: input.event,
    user_agent: USER_AGENT,
    ...(props ? { properties: JSON.stringify(props) } : {}),
    ...(input.userId ? { user_id: input.userId } : {}),
  };
  try {
    await fetchImpl(`${input.host}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {}
}

type Args<P> = P extends undefined ? [] : [props: P];

// Fire-and-forget: runs after the response is sent. Only the request path is recorded, never query strings or headers.
export function serverTrack<E extends keyof ServerEvents>(req: Request, event: E, ...args: Args<ServerEvents[E]>) {
  if (!ANALYTICS_ENABLED) return;
  const pathname = new URL(req.url).pathname;
  after(() => sendServerEvent({ host: RYBBIT_HOST, siteId: RYBBIT_SITE_ID, apiKey: process.env.RYBBIT_API_KEY || undefined, hostname: SITE_HOST, pathname, event, props: args[0] as EventProps }));
}
