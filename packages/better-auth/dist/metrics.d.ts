import { type MetricsRequest, type MetricsResponse } from "./protocol.js";
type Where = {
    field: string;
    operator?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
    value: string | number | boolean | Date | null;
};
/** The subset of the Better Auth adapter the plugin reads. Aggregate queries only. */
export type UserStore = {
    count?: (data: {
        model: string;
        where?: Where[];
    }) => Promise<number>;
    findMany: <T>(data: {
        model: string;
        where?: Where[];
        limit?: number;
        offset?: number;
        select?: string[];
    }) => Promise<T[]>;
};
export declare const SCAN_LIMIT = 50000;
export declare class MetricsError extends Error {
    readonly code: "bad_request" | "adapter_error";
    constructor(message: string, code: "bad_request" | "adapter_error");
}
export type CountResult = {
    count: number;
    exact: boolean;
};
/** `count` when the adapter supports it, otherwise a bounded id-only scan. */
export declare function countUsers(store: UserStore, where: Where[]): Promise<CountResult>;
export type MetricsOptions = {
    projectId: string;
    excludeAnonymous: boolean;
    now?: number;
};
export declare function collectMetrics(store: UserStore, request: MetricsRequest, opts: MetricsOptions): Promise<MetricsResponse>;
export {};
//# sourceMappingURL=metrics.d.ts.map