import { type LifecycleEvent, type LifecycleEventType } from "./protocol.js";
export type EventTransport = {
    endpoint: string;
    projectId: string;
    secret: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
    log?: ((message: string, meta?: Record<string, unknown>) => void) | undefined;
};
export declare function buildEvent(t: Pick<EventTransport, "projectId" | "secret">, type: LifecycleEventType, userId: string, occurredAt: Date): Promise<LifecycleEvent>;
/** Delivers one signed event. Never throws: UserTrack availability must not affect the host app. */
export declare function deliverEvent(t: EventTransport, event: LifecycleEvent): Promise<boolean>;
//# sourceMappingURL=events.d.ts.map