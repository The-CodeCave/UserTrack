import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";

const { fetchQuery, fetchMutation, fetchAction } = vi.hoisted(() => ({ fetchQuery: vi.fn(), fetchMutation: vi.fn(), fetchAction: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchQuery, fetchMutation, fetchAction }));

import { hashSecret } from "@/lib/api/gateway";
import { handleMcpRequest, MCP_VERSION } from "./server";
import { AGENT_PROMPT } from "./snippets";
import { SERVER_INSTRUCTIONS, TOOLS } from "./tools";
import { GET, OPTIONS, POST } from "@/app/mcp/route";

const SECRET = "ut_mcp_" + "s".repeat(40);
const HEADERS = { accept: "application/json, text/event-stream", "content-type": "application/json" };
let nextId = 1;

function post(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request("http://localhost/mcp", { method: "POST", headers: { ...HEADERS, ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }) });
}

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const res = await handleMcpRequest(post(method, params), SECRET);
  expect(res.status).toBe(200);
  const body = await res.json();
  return Array.isArray(body) ? body[0] : body;
}

const call = (name: string, args: Record<string, unknown> = {}) => rpc("tools/call", { name, arguments: args });
const authorized = () => fetchMutation.mockResolvedValueOnce({ limit: { perDay: 5000, usedToday: 1, remaining: 4999, resetAt: 0 } });

beforeEach(() => {
  fetchQuery.mockReset();
  fetchMutation.mockReset();
  fetchAction.mockReset();
});

describe("handleMcpRequest", () => {
  it("answers initialize with server info and instructions", async () => {
    const msg = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(msg.result.serverInfo).toEqual({ name: "usertrack", version: MCP_VERSION });
    expect(msg.result.instructions).toBe(SERVER_INSTRUCTIONS);
    expect(msg.result.capabilities.tools).toBeDefined();
    expect(msg.result.capabilities.prompts).toBeDefined();
  });

  it("lists all 36 tools with input schemas", async () => {
    const msg = await rpc("tools/list");
    const tools = msg.result.tools as { name: string; inputSchema: unknown; description: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    for (const t of tools) {
      expect(t.inputSchema, t.name).toMatchObject({ type: "object" });
      expect(t.description).toMatch(/Requires scope [a-z]+:(read|write)\.$/);
    }
    expect(tools.find((t) => t.name === "usertrack_get_projects")!.annotations.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "usertrack_create_project")!.annotations.readOnlyHint).toBe(false);
  });

  it("authorizes then runs a tool and returns JSON text + structuredContent", async () => {
    const projects = [{ id: "s1", slug: "acme", name: "Acme" }];
    authorized();
    fetchQuery.mockResolvedValueOnce(projects);
    const msg = await call("usertrack_get_projects");
    expect(fetchMutation).toHaveBeenCalledTimes(1);
    expect(getFunctionName(fetchMutation.mock.calls[0][0])).toBe("gateway:authorize");
    expect(fetchMutation.mock.calls[0][1]).toEqual({ auth: { hash: hashSecret(SECRET), gateway: undefined }, type: "mcp", scope: "projects:read", category: "usertrack_get_projects" });
    expect(fetchQuery).toHaveBeenCalledTimes(1);
    expect(getFunctionName(fetchQuery.mock.calls[0][0])).toBe("gateway:projects");
    expect(fetchQuery.mock.calls[0][1]).toEqual({ auth: { hash: hashSecret(SECRET), gateway: undefined } });
    expect(msg.result.isError).toBe(false);
    expect(msg.result.content[0].type).toBe("text");
    expect(JSON.parse(msg.result.content[0].text)).toEqual(projects);
    // Lists are wrapped: MCP requires structuredContent to be an object.
    expect(msg.result.structuredContent).toEqual({ items: projects });
  });

  it("returns object results as structuredContent unchanged", async () => {
    authorized();
    fetchQuery.mockResolvedValueOnce({ totalUsers: 12, window: { timeframe: "7d" } });
    const msg = await call("usertrack_get_metrics", { slug: "acme" });
    expect(msg.result.isError).toBe(false);
    expect(msg.result.structuredContent).toEqual({ totalUsers: 12, window: { timeframe: "7d" } });
  });

  it("does not call the tool when authorization fails", async () => {
    fetchMutation.mockRejectedValueOnce(new ConvexError({ code: "forbidden", message: "missing scope", requiredScope: "projects:read" }));
    await call("usertrack_get_projects");
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it("maps forbidden to an error result with a scope hint", async () => {
    fetchMutation.mockRejectedValueOnce(new ConvexError({ code: "forbidden", message: "This token is missing the projects:read scope", requiredScope: "projects:read" }));
    const msg = await call("usertrack_get_projects");
    expect(msg.result.isError).toBe(true);
    const err = JSON.parse(msg.result.content[0].text).error;
    expect(err.code).toBe("forbidden");
    expect(err.requiredScope).toBe("projects:read");
    expect(err.hint).toContain("projects:read scope");
    expect(msg.result.structuredContent.error.code).toBe("forbidden");
  });

  it("maps revoked to a hint about creating a new token", async () => {
    fetchMutation.mockRejectedValueOnce(new ConvexError({ code: "revoked", message: "This token has been revoked" }));
    const msg = await call("usertrack_get_projects");
    expect(msg.result.isError).toBe(true);
    const err = JSON.parse(msg.result.content[0].text).error;
    expect(err.code).toBe("revoked");
    expect(err.hint).toMatch(/new MCP token/);
  });

  it("maps rate_limited to a hint about waiting", async () => {
    fetchMutation.mockRejectedValueOnce(new ConvexError({ code: "rate_limited", message: "Daily limit reached", retryAfterSec: 30 }));
    const msg = await call("usertrack_get_projects");
    expect(msg.result.isError).toBe(true);
    const err = JSON.parse(msg.result.content[0].text).error;
    expect(err.code).toBe("rate_limited");
    expect(err.retryAfterSec).toBe(30);
    expect(err.hint).toMatch(/Wait 30s/);
  });

  it("maps unexpected errors to an internal error result", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    authorized();
    fetchQuery.mockRejectedValueOnce(new Error("Uncaught Error: something exploded\nstack"));
    const msg = await call("usertrack_get_projects");
    expect(msg.result.isError).toBe(true);
    expect(JSON.parse(msg.result.content[0].text).error).toEqual({ code: "internal", message: "something exploded" });
    spy.mockRestore();
  });

  it("passes tool arguments through to the gateway", async () => {
    authorized();
    fetchQuery.mockResolvedValueOnce({ totalUsers: 1 });
    await call("usertrack_get_metrics", { slug: "acme", timeframe: "30d" });
    expect(fetchMutation.mock.calls[0][1]).toMatchObject({ scope: "metrics:read", category: "usertrack_get_metrics" });
    expect(getFunctionName(fetchQuery.mock.calls[0][0])).toBe("gateway:metrics");
    expect(fetchQuery.mock.calls[0][1]).toMatchObject({ slug: "acme", timeframe: "30d" });
  });

  it("serves the onboarding prompt", async () => {
    const msg = await rpc("prompts/get", { name: "add_project_to_usertrack" });
    expect(msg.result.messages).toEqual([{ role: "user", content: { type: "text", text: AGENT_PROMPT } }]);
    const list = await rpc("prompts/list");
    expect(list.result.prompts.map((p: { name: string }) => p.name)).toEqual(["add_project_to_usertrack", "add_mobile_app_to_usertrack", "add_better_auth_project_to_usertrack", "add_native_sdk_project_to_usertrack"]);
    const ba = await rpc("prompts/get", { name: "add_better_auth_project_to_usertrack" });
    expect(ba.result.messages[0].content.text).toMatch(/@usertrack\/better-auth/);
    const mobile = await rpc("prompts/get", { name: "add_mobile_app_to_usertrack" });
    expect(mobile.result.messages[0].content.text).toMatch(/never revenue/);
  });

  it("rejects POSTs that do not accept both JSON and SSE", async () => {
    const res = await handleMcpRequest(post("tools/list", {}, { accept: "application/json" }), SECRET);
    expect(res.status).toBe(406);
  });
});

describe("/mcp route", () => {
  it("returns 401 with WWW-Authenticate when no token is sent", async () => {
    const res = await POST(post("tools/list"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Bearer realm="UserTrack MCP"/);
    const body = await res.json();
    expect(body.error.code).toBe(-32001);
    expect(body.error.message).toMatch(/ut_mcp_/);
  });

  it("rejects public API keys for MCP", async () => {
    const res = await POST(post("tools/list", {}, { authorization: `Bearer ut_api_${"a".repeat(40)}` }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toMatch(/ut_api_/);
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it("serves JSON-RPC for a valid ut_mcp_ token and adds CORS headers", async () => {
    const res = await POST(post("tools/list", {}, { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await res.json();
    expect((Array.isArray(body) ? body[0] : body).result.tools).toHaveLength(36);
  });

  it("answers GET without SSE accept with a JSON discovery document", async () => {
    const res = await GET(new Request("http://localhost/mcp"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("usertrack");
    expect(body.transport).toBe("streamable-http");
    expect(body.endpoint).toMatch(/\/mcp$/);
    expect(body.auth.tokenPrefix).toBe("ut_mcp_");
    expect(body.tools).toHaveLength(36);
    expect(body.tools[0]).toMatchObject({ name: "usertrack_get_account", scope: "profile:read", readOnly: true });
    expect(body.setupWorkflow[0]).toBe("usertrack_get_account");
  });

  it("refuses server-initiated SSE streams", async () => {
    const res = await GET(new Request("http://localhost/mcp", { headers: { accept: "text/event-stream" } }));
    expect(res.status).toBe(405);
  });

  it("answers OPTIONS with 204 and CORS headers", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
