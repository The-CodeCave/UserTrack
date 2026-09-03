// Legacy path used by @usertrack/better-auth 0.1.x; the signature covers this path, so it is verified as such.
import { LEGACY_EVENTS_PATH } from "@convex/lib/nativeProtocol";
import { eventsHandler, GET } from "../../native/events/route";

export const dynamic = "force-dynamic";
export const POST = eventsHandler(LEGACY_EVENTS_PATH);
export { GET };
