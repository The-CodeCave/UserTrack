import { randomBytes, createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { api } from "@convex/_generated/api";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";
import { SITE_URL } from "@/lib/site";
import { safeInternalPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Starts the X OAuth 2.0 PKCE flow for the signed-in founder. State + verifier live in Convex, bound to the profile.
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.redirect(new URL("/sign-in?next=/app/settings/social", SITE_URL));
  const state = b64url(randomBytes(24));
  const codeVerifier = b64url(randomBytes(48));
  const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());
  const redirectTo = safeInternalPath(req.nextUrl.searchParams.get("next"), "/app/settings/social");
  try {
    const url = await fetchAuthMutation(api.social.beginOAuth, { state, codeVerifier, codeChallenge, redirectTo });
    return NextResponse.redirect(url);
  } catch (e) {
    const reason = (e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0];
    return NextResponse.redirect(new URL(`/app/settings/social?x=error&reason=${encodeURIComponent(reason)}`, SITE_URL));
  }
}
