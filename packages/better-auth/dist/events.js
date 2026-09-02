import { EVENTS_PATH, PROTOCOL_VERSION, PROVIDER_ID, pseudonymize, signedHeaders } from "./protocol.js";
import { PLUGIN_VERSION } from "./version.js";
function eventId() {
    const c = globalThis.crypto;
    if (c?.randomUUID)
        return c.randomUUID();
    const b = new Uint8Array(16);
    c?.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export async function buildEvent(t, type, userId, occurredAt) {
    return {
        protocolVersion: PROTOCOL_VERSION,
        pluginVersion: PLUGIN_VERSION,
        provider: PROVIDER_ID,
        projectId: t.projectId,
        eventId: eventId(),
        type,
        subject: await pseudonymize(t.secret, userId),
        occurredAt: occurredAt.toISOString(),
    };
}
/** Delivers one signed event. Never throws: UserTrack availability must not affect the host app. */
export async function deliverEvent(t, event) {
    const doFetch = t.fetch ?? globalThis.fetch;
    const body = JSON.stringify(event);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), t.timeoutMs ?? 3000);
    try {
        const headers = await signedHeaders(t.secret, t.projectId, { method: "REQUEST", path: EVENTS_PATH, body });
        const res = await doFetch(`${t.endpoint.replace(/\/$/, "")}${EVENTS_PATH}`, {
            method: "POST",
            headers: { "content-type": "application/json", "user-agent": `usertrack-better-auth/${PLUGIN_VERSION}`, ...headers },
            body,
            signal: controller.signal,
        });
        if (!res.ok)
            t.log?.(`event ${event.type} rejected by UserTrack`, { status: res.status, eventId: event.eventId });
        return res.ok;
    }
    catch (err) {
        t.log?.(`event ${event.type} not delivered`, { eventId: event.eventId, error: err instanceof Error ? err.message : String(err) });
        return false;
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=events.js.map