import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

// The only bridge from the email system to Better Auth users; mocked in tests.
export async function findAuthUser(ctx: QueryCtx | MutationCtx, userId: string) {
  const user = await authComponent.getAnyUserById(ctx, userId);
  return user ? { email: user.email, name: user.name, emailVerified: user.emailVerified } : null;
}
