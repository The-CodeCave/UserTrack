// Reusable MCP configuration snippets, shared by onboarding, the developer dashboard and the public docs.
import { SITE_URL } from "@/lib/site";

export const MCP_URL = `${SITE_URL}/mcp`;
export const TOKEN_PLACEHOLDER = "ut_mcp_…";

export const AGENT_PROMPT =
  "Add this project to UserTrack. Detect the current authentication/user stack, choose the safest supported UserTrack integration, configure it, verify it, and return the public UserTrack URL.";

export interface Snippet { id: string; label: string; language: "bash" | "json"; text: string; hint?: string }

export function mcpSnippets(token = TOKEN_PLACEHOLDER): Snippet[] {
  const header = `Authorization: Bearer ${token}`;
  const json = (extra: Record<string, unknown> = {}) => JSON.stringify({ mcpServers: { usertrack: { url: MCP_URL, headers: { Authorization: `Bearer ${token}` }, ...extra } } }, null, 2);
  return [
    { id: "claude-code", label: "Claude Code", language: "bash", text: `claude mcp add --transport http usertrack ${MCP_URL} --header "${header}"`, hint: "Run inside your SaaS repository, then start claude." },
    { id: "cursor", label: "Cursor", language: "json", text: json(), hint: "Save as .cursor/mcp.json in the repository (or ~/.cursor/mcp.json)." },
    { id: "codex", label: "Codex CLI", language: "bash", text: `codex mcp add usertrack --url ${MCP_URL} --bearer-token-env-var USERTRACK_MCP_TOKEN\nexport USERTRACK_MCP_TOKEN=${token}`, hint: "Codex reads the token from the environment variable." },
    { id: "vscode", label: "VS Code / Copilot", language: "json", text: JSON.stringify({ servers: { usertrack: { type: "http", url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } }, null, 2), hint: "Save as .vscode/mcp.json." },
    { id: "generic", label: "Any MCP client", language: "json", text: json(), hint: `Streamable HTTP transport at ${MCP_URL}; send the token as a Bearer header.` },
  ];
}
