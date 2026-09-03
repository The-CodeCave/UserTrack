import { api } from "@convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", ...headers } });

// GDPR Art. 20: the signed-in user's data as one downloadable JSON file. Session-authenticated, never cached.
export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized", message: "Sign in to export your data" }, 401);
  const doc = await fetchAuthQuery(api.account.exportAccount, {});
  if (!doc) return json({ error: "unauthorized", message: "Sign in to export your data" }, 401);
  return json(doc, 200, { "Content-Disposition": 'attachment; filename="usertrack-export.json"' });
}
