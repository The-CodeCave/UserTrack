/**
 * UserTrack ↔ Better Auth plugin wire protocol (v1).
 * Both directions (UserTrack → plugin metrics pull, plugin → UserTrack events push)
 * are authenticated with HMAC-SHA256 over a canonical string. Runs on WebCrypto only.
 */
export declare const PROTOCOL_VERSION: 1;
export declare const PROVIDER_ID: "better-auth";
export declare const METRICS_PATH: "/usertrack/metrics";
export declare const EVENTS_PATH: "/api/integrations/better-auth/events";
export declare const DEFAULT_ENDPOINT: "https://usertrack.dev";
export declare const HEADER_PROJECT: "x-usertrack-project";
export declare const HEADER_TIMESTAMP: "x-usertrack-timestamp";
export declare const HEADER_NONCE: "x-usertrack-nonce";
export declare const HEADER_SIGNATURE: "x-usertrack-signature";
export declare const TIMESTAMP_TOLERANCE_MS: number;
export declare const MAX_HISTORY_DAYS = 90;
export type SignatureInput = {
    method: "REQUEST" | "RESPONSE";
    path: string;
    timestamp: number;
    nonce: string;
    body: string;
};
export type MetricsRequest = {
    protocolVersion: typeof PROTOCOL_VERSION;
    /** Daily new-user series for the trailing N days (1–90). */
    days?: number;
    /** Count users created in [from, to) — ISO timestamps. */
    from?: string;
    to?: string;
};
export type MetricsResponse = {
    protocolVersion: typeof PROTOCOL_VERSION;
    pluginVersion: string;
    provider: typeof PROVIDER_ID;
    projectId: string;
    generatedAt: string;
    totalUsers: number;
    newUsers: {
        "24h": number;
        "7d": number;
        "30d": number;
    };
    daily?: {
        day: string;
        newUsers: number;
    }[];
    range?: {
        from: string;
        to: string;
        count: number;
    };
    capabilities: {
        exactCounts: boolean;
        history: boolean;
        anonymousExcluded: boolean;
    };
};
export type LifecycleEventType = "user.created" | "user.deleted";
export type LifecycleEvent = {
    protocolVersion: typeof PROTOCOL_VERSION;
    pluginVersion: string;
    provider: typeof PROVIDER_ID;
    projectId: string;
    eventId: string;
    type: LifecycleEventType;
    /** HMAC-derived pseudonymous subject, never the raw user id. */
    subject: string;
    occurredAt: string;
};
export type VerifyResult = {
    ok: true;
} | {
    ok: false;
    reason: "missing_headers" | "bad_timestamp" | "stale" | "bad_signature";
};
export declare function sha256Hex(input: string): Promise<string>;
export declare function hmacHex(secret: string, message: string): Promise<string>;
export declare function canonicalString(input: SignatureInput, bodyHash: string): string;
export declare function sign(secret: string, input: SignatureInput): Promise<string>;
export declare function timingSafeEqual(a: string, b: string): boolean;
export type SignedHeaders = Record<typeof HEADER_PROJECT | typeof HEADER_TIMESTAMP | typeof HEADER_NONCE | typeof HEADER_SIGNATURE, string>;
export declare function randomNonce(): string;
export declare function signedHeaders(secret: string, projectId: string, input: Omit<SignatureInput, "timestamp" | "nonce"> & {
    timestamp?: number;
    nonce?: string;
}): Promise<SignedHeaders>;
type HeaderReader = {
    get(name: string): string | null | undefined;
} | Record<string, string | string[] | undefined>;
export type VerifyOptions = {
    now?: number;
    toleranceMs?: number;
    expectedNonce?: string;
};
/** Verify a signed request or response. `expectedNonce` binds a response to the request that produced it. */
export declare function verify(secret: string, headers: HeaderReader, input: Omit<SignatureInput, "timestamp" | "nonce">, opts?: VerifyOptions): Promise<VerifyResult & {
    timestamp?: number;
    nonce?: string;
}>;
/** Stable pseudonymous subject for a user id: HMAC keyed with the integration secret, truncated. */
export declare function pseudonymize(secret: string, userId: string): Promise<string>;
/** Bounded in-memory nonce cache for best-effort replay protection within the tolerance window. */
export declare class NonceCache {
    private readonly ttlMs;
    private readonly max;
    private seen;
    constructor(ttlMs?: number, max?: number);
    /** Returns false if the nonce was already used. */
    use(nonce: string, now?: number): boolean;
    private sweep;
}
export {};
//# sourceMappingURL=protocol.d.ts.map