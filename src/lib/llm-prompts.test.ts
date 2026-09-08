import { describe, expect, it } from "vitest";
import { apiKeyAgentPrompt, badgeAgentPrompt, mcpAgentPrompt, nativeSdkAgentPrompt, webhookAgentPrompt, widgetAgentPrompt } from "./llm-prompts";

const badge = badgeAgentPrompt({ name: "Acme", slug: "acme", kind: "users", height: 28, html: '<a href="P"><img src="I" alt="Acme on UserTrack" height="28"></a>', markdown: "[![Acme](I)](P)", imageUrl: "I", pageUrl: "P" });

describe("agent prompts", () => {
  it("carries the real snippet and the rules that keep the embed working", () => {
    expect(badge).toContain('<img src="I"');
    expect(badge).toContain("[![Acme](I)](P)");
    expect(badge).toContain("next/image");
    expect(badge).toContain('height="28"');
  });

  it("never leaves a placeholder token or an empty section", () => {
    const all = [
      badge,
      widgetAgentPrompt({ name: "Acme", slug: "acme", type: "users", script: "<script>", iframe: "<iframe>", jsonUrl: "J", width: 200, height: 28 }),
      mcpAgentPrompt({ token: "ut_mcp_secret" }),
      apiKeyAgentPrompt({ key: "ut_api_secret" }),
      webhookAgentPrompt({ url: "https://x.dev/hooks", events: ["milestone.reached"], verifySnippet: "code", payloadExample: "{}" }),
      nativeSdkAgentPrompt({ sourceLabel: "Better Auth", source: "better-auth", packageName: "@usertrack/better-auth", installCommand: "npm i", routeTitle: "Register the plugin", routePath: "lib/auth.ts", routeCode: "code", envSnippet: "ENV=1", verifyUrl: "https://x.dev/api/auth", notes: ["a note"] }),
    ];
    for (const p of all) {
      expect(p).not.toContain("undefined");
      expect(p).not.toContain("ut_mcp_…");
      expect(p.length).toBeGreaterThan(400);
      expect(p).toMatch(/AFTER THE CHANGE/);
    }
  });

  it("passes the secret through so the agent can actually configure the client", () => {
    expect(mcpAgentPrompt({ token: "ut_mcp_secret" })).toContain("ut_mcp_secret");
    expect(apiKeyAgentPrompt({ key: "ut_api_secret" })).toContain("ut_api_secret");
    expect(apiKeyAgentPrompt({})).toContain("process.env.USERTRACK_API_KEY");
  });
});
