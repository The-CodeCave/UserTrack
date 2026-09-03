import type { MutationCtx, QueryCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { authComponent } from "../auth";

// The only bridge from the email system to Better Auth users; mocked in tests.
export async function findAuthUser(ctx: QueryCtx | MutationCtx, userId: string) {
  const user = await authComponent.getAnyUserById(ctx, userId);
  return user ? { email: user.email, name: user.name, emailVerified: user.emailVerified } : null;
}

// Removes the Better Auth rows of one user through the component adapter: sessions, linked accounts, pending
// verifications, then the user itself. Runs inside the caller's transaction, after the app data is gone.
export async function deleteAuthUser(ctx: MutationCtx, userId: string, email: string) {
  const byUser = [{ field: "userId" as const, operator: "eq" as const, value: userId }];
  const paged = async (run: (cursor: string | null) => Promise<{ isDone: boolean; continueCursor: string }>) => {
    let cursor: string | null = null;
    do {
      const r = await run(cursor);
      cursor = r.isDone ? null : r.continueCursor;
    } while (cursor);
  };
  await paged((cursor) => ctx.runMutation(components.betterAuth.adapter.deleteMany, { input: { model: "session", where: byUser }, paginationOpts: { numItems: 200, cursor } }));
  await paged((cursor) => ctx.runMutation(components.betterAuth.adapter.deleteMany, { input: { model: "account", where: byUser }, paginationOpts: { numItems: 200, cursor } }));
  await paged((cursor) => ctx.runMutation(components.betterAuth.adapter.deleteMany, { input: { model: "verification", where: [{ field: "identifier", operator: "eq", value: email }] }, paginationOpts: { numItems: 200, cursor } }));
  await ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "user", where: [{ field: "_id", operator: "eq", value: userId }] } });
}
