import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { CLIENT_IP_HEADER, clientIp } from "@/lib/client-ip";

const AUTH_PAGES = ["/sign-in", "/sign-up"];
const JWT_TOLERANCE_S = 60;

const jwtAlive = (jwt: string) => {
  try {
    return Number(JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()).exp) > Date.now() / 1000 - JWT_TOLERANCE_S;
  } catch {
    return false;
  }
};

// Route guard only — the app shell re-checks on the client and every Convex function enforces auth itself.
// A live `convex_jwt` cookie answers without a round trip; otherwise Better Auth is asked for a token with the trusted
// client IP stamped like the /api/auth proxy does (without it every visitor shared one `no-trusted-ip` bucket of 100/min).
// null = Convex did not answer (outage, 429): the request passes through instead of bouncing a signed-in founder.
export async function sessionState(req: NextRequest): Promise<boolean | null> {
  const jwt = getSessionCookie(req.headers, { cookieName: "convex_jwt" });
  if (jwt && jwtAlive(jwt)) return true;
  const cookie = req.headers.get("cookie");
  if (!cookie || !getSessionCookie(req.headers)) return false;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/auth/convex/token`, { headers: { cookie, [CLIENT_IP_HEADER]: clientIp(req) }, cache: "no-store" });
    if (res.status === 401) return false;
    if (!res.ok) return null;
    return Boolean(((await res.json()) as { token?: string | null }).token);
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = await sessionState(request);

  if (pathname.startsWith("/app") && authed === false) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (AUTH_PAGES.some((p) => pathname.startsWith(p)) && authed === true) {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/sign-in", "/sign-up"],
};
