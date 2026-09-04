/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { fillEmpty, prefillFor, takePrefill } from "./authProfile";

const modules = import.meta.glob("./**/*.*s");

describe("fillEmpty", () => {
  it("keeps what the founder already set and drops empty imports", () => {
    expect(fillEmpty({ x: "ada", github: undefined }, { x: "someone_else", github: "ada-dev", avatarUrl: "" })).toEqual({ github: "ada-dev" });
  });
});

describe("applyProviderProfile", () => {
  it("fills only the empty fields of an existing profile", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.db.insert("profiles", { userId: "u1", username: "ada", displayName: "Ada", onboardingCompleted: true, x: "ada_x", avatarUrl: "https://example.com/me.png" }));
    await t.mutation(internal.authProfile.applyProviderProfile, { userId: "u1", github: "ada-dev", avatarUrl: "https://avatars.githubusercontent.com/u/1" });
    await t.mutation(internal.authProfile.applyProviderProfile, { userId: "u1", x: "other" });
    const profile = await t.run((ctx) => ctx.db.get(id));
    expect(profile).toMatchObject({ github: "ada-dev", x: "ada_x", avatarUrl: "https://example.com/me.png" });
    expect(await t.run((ctx) => ctx.db.query("profilePrefills").collect())).toEqual([]);
  });

  it("parks the values until the profile is created, then hands them over once", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.authProfile.applyProviderProfile, { userId: "u2", github: "ada-dev", avatarUrl: "https://avatars.githubusercontent.com/u/1" });
    await t.mutation(internal.authProfile.applyProviderProfile, { userId: "u2", x: "ada", avatarUrl: "https://pbs.twimg.com/a_400x400.jpg" });
    expect(await t.run((ctx) => prefillFor(ctx, "u2"))).toEqual({ github: "ada-dev", x: "ada", avatarUrl: "https://avatars.githubusercontent.com/u/1" });
    expect(await t.run((ctx) => prefillFor(ctx, "nobody"))).toBeNull();
    expect(await t.run((ctx) => takePrefill(ctx, "u2"))).toMatchObject({ github: "ada-dev", x: "ada" });
    expect(await t.run((ctx) => takePrefill(ctx, "u2"))).toEqual({});
    expect(await t.run((ctx) => ctx.db.query("profilePrefills").collect())).toEqual([]);
  });
});
