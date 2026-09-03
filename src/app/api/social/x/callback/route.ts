import { NextResponse, type NextRequest } from "next/server";
import { api } from "@convex/_generated/api";
import { fetchAuthAction, isAuthenticated } from "@/lib/auth-server";
import { SITE_URL } from "@/lib/site";
import { limit, tooMany } from "@/lib/api/rate-limit";
import { safeInternalPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

const back = (q: string) => NextResponse.redirect(new URL(`/app/settings/social?${q}`, SITE_URL));

// X redirects here with ?code&state (or ?error). The signed-in session must own the state (CSRF binding in Convex).
export async function GET(req: NextRequest) {
  const rl = await limit(req, "xCallback");
  if (!rl.allowed) return tooMany(rl, "Too many attempts");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`x=error&reason=${encodeURIComponent(p.get("error_description") ?? p.get("error") ?? "denied")}`);
  const code = p.get("code");
  const state = p.get("state");
  if (!code || !state) return back("x=error&reason=missing%20code");
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/sign-in?next=/app/settings/social", SITE_URL));
  try {
    const r = await fetchAuthAction(api.social.completeOAuth, { state, code });
    const dest = safeInternalPath(r.redirectTo, "/app/settings/social");
    return NextResponse.redirect(new URL(`${dest}${dest.includes("?") ? "&" : "?"}x=connected`, SITE_URL));
  } catch (e) {
    const reason = (e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0].slice(0, 160);
    return back(`x=error&reason=${encodeURIComponent(reason)}`);
  }
}
