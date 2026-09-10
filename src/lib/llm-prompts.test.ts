import { describe, expect, it } from "vitest";
import { activationAgentPrompt, apiKeyAgentPrompt, badgeAgentPrompt, mcpAgentPrompt, nativeSdkAgentPrompt, webhookAgentPrompt, widgetAgentPrompt } from "./llm-prompts";
import { AGENT_PROMPT, BETTER_AUTH_AGENT_PROMPT, MOBILE_AGENT_PROMPT, NATIVE_AGENT_PROMPT } from "./mcp/snippets";

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
      activationAgentPrompt({ token: "ut_mcp_secret", project: { id: "project_123", name: "Acme", websiteUrl: "https://acme.test" } }),
      apiKeyAgentPrompt({ key: "ut_api_secret" }),
      webhookAgentPrompt({ url: "https://x.dev/hooks", secret: "whsec_secret", events: ["milestone.reached"], verifySnippet: "code", payloadExample: "{}" }),
      nativeSdkAgentPrompt({ sourceLabel: "Better Auth", source: "better-auth", packageName: "@usertrack/better-auth", installCommand: "npm i", routeTitle: "Register the plugin", routePath: "lib/auth.ts", routeCode: "code", envSnippet: "ENV=1", verifyUrl: "https://x.dev/api/auth", notes: ["a note"] }),
    ];
    for (const p of all) {
      expect(p).not.toContain("undefined");
      expect(p).not.toContain("ut_mcp_…");
      expect(p.length).toBeGreaterThan(400);
      expect(p).toMatch(/AFTER THE CHANGE/);
    }
  });

  it("makes activation agent-first without letting the agent guess an ambiguous product decision", () => {
    const prompt = activationAgentPrompt({ token: "ut_mcp_secret", project: { id: "project_123", name: "Acme", websiteUrl: "https://acme.test" }, context: "Value starts after the first report." });
    expect(prompt).toContain("usertrack_get_activation_setup");
    expect(prompt).toContain("ask me exactly one concise question");
    expect(prompt).toContain("project_123");
    expect(prompt).toContain("first report");
    expect(prompt).toContain("must never exceed total users");
  });

  it("tells the agent to publish, so the URL it reports back is not a 404", () => {
    for (const p of [mcpAgentPrompt({ token: "ut_mcp_secret" }), AGENT_PROMPT, MOBILE_AGENT_PROMPT, BETTER_AUTH_AGENT_PROMPT, NATIVE_AGENT_PROMPT]) {
      expect(p).toContain("isPublic: true");
    }
  });

  it("passes the secret through so the agent can actually configure the client", () => {
    expect(mcpAgentPrompt({ token: "ut_mcp_secret" })).toContain("ut_mcp_secret");
    expect(apiKeyAgentPrompt({ key: "ut_api_secret" })).toContain("ut_api_secret");
    expect(nativeSdkAgentPrompt({ sourceLabel: "Better Auth", source: "better-auth", packageName: "@usertrack/better-auth", installCommand: "npm i", routeTitle: "Register", routePath: "lib/auth.ts", routeCode: "code", envSnippet: "USERTRACK_SECRET=ut_int_secret", verifyUrl: "https://acme.test/api/usertrack", notes: [] })).toContain("ut_int_secret");
    expect(apiKeyAgentPrompt({})).toContain("process.env.USERTRACK_API_KEY");
  });

  it("includes the webhook signing secret in the one-paste agent prompt", () => {
    const prompt = webhookAgentPrompt({ url: "https://acme.test/webhooks/usertrack", secret: "whsec_secret", events: ["saas.updated"], verifySnippet: "verify(rawBody)", payloadExample: "{}" });
    expect(prompt).toContain("whsec_secret");
    expect(prompt).toContain("USERTRACK_WEBHOOK_SECRET");
  });
});
