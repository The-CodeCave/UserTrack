// Lifecycle events are delivered by @usertrack/node's tracker; this module only fixes the Better Auth identity.
import { createTracker, type Tracker, type TrackerOptions } from "@usertrack/node";
import { PLUGIN_VERSION } from "./version.js";

export type EventTransport = Omit<TrackerOptions, "source" | "clientVersion">;

export function betterAuthTracker(t: EventTransport): Tracker {
  return createTracker({ ...t, source: "better-auth", clientVersion: PLUGIN_VERSION });
}
