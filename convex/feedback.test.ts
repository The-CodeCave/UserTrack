/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: async () => ({ _id: "u_ada", email: "ada@example.com", name: "Ada", emailVerified: true }) } }));

const modules = import.meta.glob("./**/*.*s");
const body = { kind: "bug" as const, message: "The Stripe step throws a 500 every time." };

async function seed(withProfile = true) {
  const t = convexTest(schema, modules);
  if (withProfile) await t.run((ctx) => ctx.db.insert("profiles", { userId: "u_ada", username: "ada", displayName: "Ada", onboardingCompleted: true }));
  return t;
}

describe("feedback", () => {
  it("stores a signed-in report with the profile attached", async () => {
    const t = await seed();
    await t.mutation(api.feedback.submit, { ...body, path: "/app/onboarding" });
    const rows = await t.run((ctx) => ctx.db.query("feedback").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "bug", status: "new", userId: "u_ada", path: "/app/onboarding" });
    expect(rows[0].profileId).toBeDefined();
  });

  it("rejects an empty message and throttles a flood", async () => {
    const t = await seed();
    await expect(t.mutation(api.feedback.submit, { kind: "idea", message: "hi" })).rejects.toThrow(/describe/i);
    for (let i = 0; i < 10; i++) await t.mutation(api.feedback.submit, { ...body, message: `${body.message} ${i}` });
    await expect(t.mutation(api.feedback.submit, body)).rejects.toThrow(/email/i);
  });

  it("only accepts an anonymous report with the gateway secret", async () => {
    const t = await seed(false);
    vi.stubEnv("UT_GATEWAY_SECRET", "s3cret");
    await expect(t.mutation(api.feedback.submitAnonymous, { ...body, gateway: "wrong" })).rejects.toThrow();
    await t.mutation(api.feedback.submitAnonymous, { ...body, gateway: "s3cret", email: "visitor@example.com" });
    const rows = await t.run((ctx) => ctx.db.query("feedback").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].profileId).toBeUndefined();
    expect(rows[0].email).toBe("visitor@example.com");
    vi.unstubAllEnvs();
  });
});
