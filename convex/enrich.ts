// Onboarding autofill: read public sources so a founder types a URL or a handle instead of a form.
// `site` reads the <head> of their own website, `avatar` resolves a profile picture from the handles they already gave
// us. Nothing is saved to a project or profile here — the form decides what to apply — but images are copied into
// Convex storage so they keep working when the origin changes them.
import { ConvexError, v } from "convex/values";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { action, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { RATE_LIMITS } from "./lib/rateLimits";
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "./lib/uploads";
import { parseSiteMeta, publicUrl } from "./lib/siteMeta";
import { X_USER_BY_USERNAME, appTokenBody } from "./lib/xApi";
import { type AvatarCandidate, type AvatarSource, githubAvatarUrl, gravatarKey, gravatarUrl, sha256Hex, unavatarUrl, xAvatarSize } from "./lib/avatarSources";
import { isValidHandle } from "../src/lib/slug";
import { isValidXHandle, normalizeXHandle } from "../src/lib/social";

const limiter = new RateLimiter(components.rateLimiter, RATE_LIMITS);
const PAGE_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 512_000;
const MAX_REDIRECTS = 3;
const UA = "UserTrackBot/1.0 (+https://usertrack.dev)";

export interface SiteImport {
  url: string;
  name?: string;
  description?: string;
  valueProposition?: string;
  logoUrl?: string;
  logoStorageId?: Id<"_storage">;
}

export interface AvatarImport {
  url: string;
  storageId?: Id<"_storage">;
  source: AvatarSource;
}

const fail = (code: string, message: string) => new ConvexError({ code, message });

export const meIdentity = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not signed in");
    return { id: user._id, email: user.email ?? null };
  },
});

export const takeSlot = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const r = await limiter.limit(ctx, "enrich", { key: userId });
    return { ok: r.ok, retryAfterMs: r.retryAfter ?? 0 };
  },
});

async function budget(ctx: ActionCtx) {
  const me: { id: string; email: string | null } = await ctx.runQuery(internal.enrich.meIdentity, {});
  const slot = await ctx.runMutation(internal.enrich.takeSlot, { userId: me.id });
  if (!slot.ok) throw fail("rate_limited", `Too many lookups; try again in ${Math.max(1, Math.ceil(slot.retryAfterMs / 60_000))} min`);
  return me;
}

// Follows redirects by hand so every hop is re-checked against the public-host rules; `fetch` would follow a redirect
// from a public domain straight to a loopback or metadata address.
async function guardedFetch(start: URL, accept: string, timeoutMs: number) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { accept, "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status < 300 || res.status > 399) return { res, url };
    const next = res.headers.get("location");
    if (!next) return { res, url };
    const target = publicUrl(new URL(next, url).toString());
    if (!target) return null;
    url = target;
  }
  return null;
}

// Copies a remote image into Convex storage. Returns null for anything that is not a small PNG / JPG / WebP, so the
// caller can fall back to linking the original (an .ico or .svg favicon still renders fine in an <img>).
async function storeImage(ctx: ActionCtx, url: URL): Promise<Id<"_storage"> | null> {
  try {
    const hit = await guardedFetch(url, "image/*", IMAGE_TIMEOUT_MS);
    if (!hit?.res.ok) return null;
    const type = (hit.res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) return null;
    const blob = await hit.res.blob();
    if (blob.size === 0 || blob.size > IMAGE_MAX_BYTES) return null;
    return await ctx.storage.store(blob);
  } catch {
    return null;
  }
}

// Public metadata of the founder's own site: name, description, tagline and the best available icon.
export const site = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<SiteImport> => {
    const target = publicUrl(url);
    if (!target) throw fail("bad_request", "Enter a public website address, e.g. https://yourdomain.com");
    await budget(ctx);

    let hit: Awaited<ReturnType<typeof guardedFetch>>;
    try {
      hit = await guardedFetch(target, "text/html,application/xhtml+xml", PAGE_TIMEOUT_MS);
    } catch {
      throw fail("unreachable", `Could not reach ${target.hostname}. Check the address or fill the form in yourself.`);
    }
    if (!hit) throw fail("unreachable", "That address redirects somewhere we will not follow");
    if (!hit.res.ok) throw fail("unreachable", `${target.hostname} answered ${hit.res.status}. Check the address or fill the form in yourself.`);

    const meta = parseSiteMeta((await hit.res.text()).slice(0, MAX_HTML_BYTES), hit.url.toString());
    const icon = meta.iconUrl ? publicUrl(meta.iconUrl) : null;
    const storageId = icon ? await storeImage(ctx, icon) : null;
    // Only an icon we actually fetched is offered: hotlinking one we could not read shows the founder a broken image.
    return {
      url: hit.url.origin + (hit.url.pathname === "/" ? "" : hit.url.pathname),
      name: meta.name,
      description: meta.description,
      valueProposition: meta.valueProposition,
      logoUrl: (storageId ? await ctx.storage.getUrl(storageId) : null) ?? undefined,
      logoStorageId: storageId ?? undefined,
    };
  },
});

// App-only bearer for public profile lookups. Absent or unauthorised on X plans without app-only access, which is why
// the caller has a keyless fallback.
async function xAppBearer(): Promise<string | null> {
  const id = process.env.X_CLIENT_ID;
  const secret = process.env.X_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const res = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: appTokenBody(),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

// X's own API needs a plan that includes `users/by/username`; without it this returns null and the keyless
// unavatar route is used instead.
async function xApiAvatar(handle: string): Promise<string | null> {
  const bearer = await xAppBearer();
  if (!bearer) return null;
  try {
    const res = await fetch(X_USER_BY_USERNAME(handle), { headers: { Authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data?: { profile_image_url?: string } };
    return data?.profile_image_url ? xAvatarSize(data.profile_image_url) : null;
  } catch {
    return null;
  }
}

// Every free source we can try for this founder, best first. unavatar's free tier is only 25 lookups a day across our
// whole deployment, so GitHub and Gravatar are not a nicety — they are what keeps the feature working once it is spent.
async function avatarCandidates(i: { x?: string; github?: string; email?: string | null }): Promise<AvatarCandidate[]> {
  const out: AvatarCandidate[] = [];
  if (i.x) {
    const viaApi = await xApiAvatar(i.x);
    out.push({ source: "x", url: viaApi ?? unavatarUrl(i.x) });
  }
  if (i.github) out.push({ source: "github", url: githubAvatarUrl(i.github) });
  if (i.email) out.push({ source: "gravatar", url: gravatarUrl(await sha256Hex(gravatarKey(i.email))) });
  return out;
}

// Profile picture from the handles the founder already gave us, copied into storage so it survives the origin
// changing it. Tries X, then GitHub, then Gravatar, and reports which one answered.
export const avatar = action({
  args: { x: v.optional(v.string()), github: v.optional(v.string()), includeEmail: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<AvatarImport> => {
    const x = args.x ? normalizeXHandle(args.x) : "";
    if (args.x && !isValidXHandle(x)) throw fail("bad_request", "Enter an X handle like @ada or a x.com profile link");
    const github = args.github?.trim().replace(/^@/, "") ?? "";
    const me = await budget(ctx);
    // Gravatar is only consulted on an explicit request: a handle the founder typed is intent, their account address is not.
    const candidates = await avatarCandidates({ x: x || undefined, github: isValidHandle(github) ? github : undefined, email: args.includeEmail ? me.email : null });
    if (candidates.length === 0) throw fail("bad_request", "Add your X or GitHub handle first");
    for (const candidate of candidates) {
      const url = publicUrl(candidate.url);
      const storageId = url ? await storeImage(ctx, url) : null;
      if (!storageId) continue;
      const stored = await ctx.storage.getUrl(storageId);
      if (stored) return { url: stored, storageId, source: candidate.source };
    }
    throw fail("not_found", "No public profile picture found — upload one instead");
  },
});
