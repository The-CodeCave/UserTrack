import { createTracker, type TrackerOptions } from "./track.js";

/**
 * Auth.js / NextAuth `events` block: `events: { ...userTrackAuthjsEvents({ projectId, secret }) }` pushes
 * `user.created` after the adapter created the user. Counting still needs the database adapter's user model
 * (`prismaUsers(prisma.user, …)` / `drizzleUsers(db, users, …)`): Auth.js adapters expose no count method.
 */
export function userTrackAuthjsEvents(options: TrackerOptions) {
  const tracker = createTracker({ source: "authjs", ...options });
  return {
    createUser: async ({ user }: { user: { id?: string | null } }) => {
      if (user?.id) tracker.track("user.created", { id: user.id });
    },
  };
}
