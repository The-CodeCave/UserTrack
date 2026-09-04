import { describe, expect, it, vi } from "vitest";
import { SCOPE_KEYS } from "@convex/lib/tokens";

vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn(), fetchMutation: vi.fn(), fetchAction: vi.fn() }));

import { SERVER_INSTRUCTIONS, SETUP_WORKFLOW, TOOLS, WEBHOOK_WORKFLOW } from "./tools";

const EXPECTED = [
  "usertrack_get_account",
  "usertrack_get_projects",
  "usertrack_get_project",
  "usertrack_create_project",
  "usertrack_update_project",
  "usertrack_import_from_trustmrr",
  "usertrack_get_supported_integrations",
  "usertrack_get_integration_setup",
  "usertrack_configure_integration",
  "usertrack_verify_integration",
  "usertrack_sync_project",
  "usertrack_get_metrics",
  "usertrack_get_growth_history",
  "usertrack_get_rank",
  "usertrack_get_milestones",
  "usertrack_get_share_url",
  "usertrack_get_provider_recommendation",
  "usertrack_get_activation_setup",
  "usertrack_get_funnel",
  "usertrack_get_trending",
  "usertrack_get_benchmark",
  "usertrack_compare_projects",
  "usertrack_get_share_card",
  "usertrack_get_embed_code",
  "usertrack_get_conversion_setup",
  "usertrack_get_identity_mapping",
  "usertrack_get_funnel_history",
  "usertrack_get_cohorts",
  "usertrack_get_native_setup",
  "usertrack_get_better_auth_setup",
  "usertrack_create_integration",
  "usertrack_get_profile",
  "usertrack_export_account",
  "usertrack_update_profile",
  "usertrack_get_share_events",
  "usertrack_create_share_card",
  "usertrack_get_x_draft",
  "usertrack_get_founder_url",
  "usertrack_discover",
  "usertrack_follow_project",
  "usertrack_unfollow_project",
  "usertrack_follow_founder",
  "usertrack_unfollow_founder",
  "usertrack_get_watchlist",
  "usertrack_get_rank_history",
  "usertrack_get_benchmark_history",
  "usertrack_get_dataset",
  "usertrack_get_webhooks",
  "usertrack_create_webhook",
  "usertrack_update_webhook",
  "usertrack_test_webhook",
  "usertrack_get_webhook_deliveries",
];

describe("MCP tool set", () => {
  it("exposes exactly the 52 expected tools with unique names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(EXPECTED);
    expect(new Set(names).size).toBe(52);
  });

  it("gives every tool a title, description and a known scope", () => {
    for (const t of TOOLS) {
      expect(t.title.length, t.name).toBeGreaterThan(0);
      expect(t.description.length, t.name).toBeGreaterThan(20);
      expect(SCOPE_KEYS.has(t.scope), `${t.name} scope ${t.scope}`).toBe(true);
      expect(typeof t.run).toBe("function");
      expect(t.input && typeof t.input === "object").toBe(true);
    }
  });

  it("read-only tools use read scopes and write tools use write scopes", () => {
    for (const t of TOOLS) {
      if (t.readOnly) expect(t.scope, t.name).toMatch(/:read$/);
      else expect(t.scope, t.name).toMatch(/:write$/);
    }
    expect(TOOLS.filter((t) => !t.readOnly).map((t) => t.name)).toEqual(["usertrack_create_project", "usertrack_update_project",
  "usertrack_import_from_trustmrr", "usertrack_configure_integration", "usertrack_verify_integration", "usertrack_sync_project", "usertrack_create_integration", "usertrack_update_profile", "usertrack_create_share_card", "usertrack_follow_project", "usertrack_unfollow_project", "usertrack_follow_founder", "usertrack_unfollow_founder", "usertrack_create_webhook", "usertrack_update_webhook", "usertrack_test_webhook"]);
  });

  it("describes the setup workflow in order", () => {
    expect(SETUP_WORKFLOW[0]).toBe("usertrack_get_account");
    expect(SETUP_WORKFLOW[SETUP_WORKFLOW.length - 1]).toMatch(/^usertrack_get_share_url/);
    expect(SERVER_INSTRUCTIONS).toContain("in order");
    for (const [i, step] of SETUP_WORKFLOW.entries()) expect(SERVER_INSTRUCTIONS).toContain(`${i + 1}. ${step}`);
    expect(SERVER_INSTRUCTIONS).toMatch(/never print or log credentials/);
    expect(SERVER_INSTRUCTIONS).toMatch(/conversion state only, never revenue/);
    expect(SERVER_INSTRUCTIONS).toMatch(/Add this iOS app to UserTrack/);
    expect(SETUP_WORKFLOW.some((s) => s.startsWith("optional: usertrack_get_conversion_setup"))).toBe(true);
  });

  it("uses lifecycle roles and lists the payment providers", () => {
    const setup = TOOLS.find((t) => t.name === "usertrack_get_integration_setup")!;
    expect((setup.input.role as unknown as { unwrap(): { options: string[] } }).unwrap().options).toEqual(["users", "activation", "traffic", "conversion"]);
    const rec = TOOLS.find((t) => t.name === "usertrack_get_provider_recommendation")!;
    expect(Object.keys(rec.input).sort()).toEqual(["detectedAnalytics", "detectedAuth", "detectedPayments", "detectedProviders", "framework", "projectType"]);
    expect(rec.description).toMatch(/RevenueCat/);
    expect(TOOLS.find((t) => t.name === "usertrack_get_conversion_setup")!.description).toMatch(/never amounts/);
  });

  it("v0.9 tools use the new scopes and describe the watchlist + webhook flows", () => {
    const byName = (n: string) => TOOLS.find((t) => t.name === n)!;
    expect(byName("usertrack_get_watchlist").scope).toBe("follows:read");
    expect(byName("usertrack_follow_project").scope).toBe("follows:write");
    expect(byName("usertrack_get_webhooks").scope).toBe("webhooks:read");
    expect(byName("usertrack_create_webhook").scope).toBe("webhooks:write");
    expect(byName("usertrack_create_webhook").description).toMatch(/returned ONLY/);
    const events = (byName("usertrack_create_webhook").input.events as unknown as { element: { options: string[] } }).element.options;
    expect(events).toEqual(["milestone.reached", "rank.changed", "trending.rank_changed", "growth.spike", "integration.failed", "integration.recovered", "project.verified"]);
    expect((byName("usertrack_get_dataset").input.dataset as unknown as { options: string[] }).options).toEqual(["trending", "fastest-growing", "new-and-rising", "hidden-gems", "movers", "category", "rankings"]);
    expect(WEBHOOK_WORKFLOW[0]).toMatch(/^usertrack_get_webhooks/);
    expect(SERVER_INSTRUCTIONS).toMatch(/Discovery & watchlist flow/);
    expect(SERVER_INSTRUCTIONS).toMatch(/Webhook flow/);
    expect(SERVER_INSTRUCTIONS).toMatch(/usertrack_get_webhooks .*usertrack_create_webhook .*usertrack_test_webhook .*usertrack_get_webhook_deliveries/);
    expect(SERVER_INSTRUCTIONS).toMatch(/never log it/);
  });

  it("native tools accept every SDK source and keep the Better Auth alias", () => {
    const create = TOOLS.find((t) => t.name === "usertrack_create_integration")!;
    expect((create.input.provider as unknown as { options: string[] }).options).toEqual(["native", "better_auth"]);
    expect((create.input.source as unknown as { unwrap(): { options: string[] } }).unwrap().options).toEqual(["better-auth", "prisma", "drizzle", "convex", "authjs", "custom"]);
    expect(TOOLS.find((t) => t.name === "usertrack_get_better_auth_setup")!.description).toMatch(/Deprecated alias of usertrack_get_native_setup/);
    expect(SERVER_INSTRUCTIONS).toMatch(/Native SDK flow/);
  });
});
