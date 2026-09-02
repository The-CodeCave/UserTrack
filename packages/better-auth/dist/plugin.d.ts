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
export declare function userTrack(options: UserTrackPluginOptions): {
    id: "usertrack";
    version: string;
    init(): {
        options: {
            databaseHooks: {
                user: {
                    create: {
                        after: (user: {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            image?: string | null | undefined;
                        } & Record<string, unknown>, ctx: import("better-auth").GenericEndpointContext | null) => Promise<void>;
                    };
                    delete: {
                        after: (user: {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            image?: string | null | undefined;
                        } & Record<string, unknown>, ctx: import("better-auth").GenericEndpointContext | null) => Promise<void>;
                    };
                };
            };
        };
    };
    endpoints: {
        usertrackMetrics: import("better-call").StrictEndpoint<"/usertrack/metrics", {
            method: "POST";
        }, Response>;
    };
    rateLimit: {
        pathMatcher: (path: string) => path is "/usertrack/metrics";
        window: number;
        max: number;
    }[];
    options: {
        projectId: string;
        endpoint: string;
        events: boolean;
    };
};
export type UserTrackPlugin = ReturnType<typeof userTrack>;
//# sourceMappingURL=plugin.d.ts.map