import { describe, expect, it, vi } from "vitest";
import { SCOPE_KEYS } from "@convex/lib/tokens";

vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn(), fetchMutation: vi.fn(), fetchAction: vi.fn() }));

import { SERVER_INSTRUCTIONS, SETUP_WORKFLOW, TOOLS } from "./tools";

const EXPECTED = [
  "usertrack_get_account",
  "usertrack_get_projects",
  "usertrack_get_project",
  "usertrack_create_project",
  "usertrack_update_project",
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
];

describe("MCP tool set", () => {
  it("exposes exactly the 15 expected tools with unique names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(EXPECTED);
    expect(new Set(names).size).toBe(15);
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
    expect(TOOLS.filter((t) => !t.readOnly).map((t) => t.name)).toEqual(["usertrack_create_project", "usertrack_update_project", "usertrack_configure_integration", "usertrack_verify_integration", "usertrack_sync_project"]);
  });

  it("describes the setup workflow in order", () => {
    expect(SETUP_WORKFLOW[0]).toBe("usertrack_get_account");
    expect(SETUP_WORKFLOW[SETUP_WORKFLOW.length - 1]).toMatch(/^usertrack_get_share_url/);
    expect(SERVER_INSTRUCTIONS).toContain("in order");
    for (const [i, step] of SETUP_WORKFLOW.entries()) expect(SERVER_INSTRUCTIONS).toContain(`${i + 1}. ${step}`);
    expect(SERVER_INSTRUCTIONS).toMatch(/never print or log credentials/);
  });
});
