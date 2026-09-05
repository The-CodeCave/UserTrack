// X account connection (OAuth 2.0 PKCE), founder social preferences and opt-in posting. Two independent pathways:
// the founder's own connected account and the UserTrack-owned account (OAuth 1.0a env credentials). Credentials never
// mix, tokens are never returned to clients, and nothing posts unless a founder switched it on.
import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getProfileForUser, requireProfile } from "./profiles";
import { siteUrl } from "./domain/projects";
import { attributedUrl } from "../src/lib/site";
import { xConnectionState } from "../src/lib/social";
import { safeInternalPath } from "../src/lib/safe-redirect";
import { xDraft, type DraftKind } from "../src/lib/x-drafts";
import { botWorthy, normalizePrefs } from "./lib/shareRules";
import { authorizeUrl, basicAuth, describeXError, FOLLOWERS_PAGE_SIZE, FOLLOWERS_REFRESH_COOLDOWN_MS, followersOf, needsRefresh, OAUTH_STATE_TTL_MS, oauth1Header, parseTokenResponse, refreshRequestBody, tokenRequestBody, X_ME_URL, X_REVOKE_URL, X_TOKEN_URL, X_TWEETS_URL, type XMe } from "./lib/xApi";
import { DAY } from "./lib/time";
import { failActionRun } from "./jobs";

export const FOUNDER_POST_COOLDOWN_MS = DAY;
export const BOT_DAILY_CAP = 3;
const EVENT_MAX_AGE_MS = 2 * DAY;

const oauthEnabled = () => Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
const botCreds = () => {
  const { X_BOT_CONSUMER_KEY: consumerKey, X_BOT_CONSUMER_SECRET: consumerSecret, X_BOT_ACCESS_TOKEN: accessToken, X_BOT_ACCESS_SECRET: accessSecret } = process.env;
  return consumerKey && consumerSecret && accessToken && accessSecret ? { consumerKey, consumerSecret, accessToken, accessSecret } : null;
};

const connectionView = (c: Doc<"socialConnections">) => ({ handle: c.handle, name: c.name, avatarUrl: c.avatarUrl, connectedAt: c.connectedAt, lastPostAt: c.lastPostAt, status: c.status, lastError: c.lastError, scopes: c.scopes });

const connectionOf = (ctx: QueryCtx | MutationCtx, profileId: Id<"profiles">) =>
  ctx.db.query("socialConnections").withIndex("by_profile_provider", (q) => q.eq("profileId", profileId).eq("provider", "x")).unique();

export const status = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getProfileForUser(ctx);
    if (!profile) return null;
    const c = await connectionOf(ctx, profile._id);
    const posts = await ctx.db.query("socialPosts").withIndex("by_profile_time", (q) => q.eq("profileId", profile._id)).order("desc").take(5);
    return {
      oauthEnabled: oauthEnabled(),
      botEnabled: botCreds() !== null,
      handle: profile.x,
      state: xConnectionState({ handle: profile.x, connected: Boolean(c && c.status !== "revoked") }),
      connection: c ? connectionView(c) : null,
      followers: profile.xFollowers,
      followersAt: profile.xFollowersAt,
      prefs: normalizePrefs(profile.socialPrefs),
      recentPosts: posts.map((p) => ({ _id: p._id, account: p.account, status: p.status, text: p.text, error: p.error, createdAt: p.createdAt, postedAt: p.postedAt, providerPostId: p.providerPostId })),
    };
  },
});

// ---- OAuth 2.0 PKCE ---------------------------------------------------------------------------------------------------

export const beginOAuth = mutation({
  args: { state: v.string(), codeVerifier: v.string(), codeChallenge: v.string(), redirectTo: v.optional(v.string()) },
  handler: async (ctx, { state, codeVerifier, codeChallenge, redirectTo }) => {
    const { profile } = await requireProfile(ctx);
    if (!oauthEnabled()) throw new Error("X connection is not enabled on this deployment");
    if (state.length < 16 || codeVerifier.length < 43) throw new Error("Invalid OAuth parameters");
    await ctx.db.insert("oauthStates", { state, profileId: profile._id, provider: "x", codeVerifier, redirectTo: safeInternalPath(redirectTo, "/app/settings/social"), createdAt: Date.now() });
    return authorizeUrl({ clientId: process.env.X_CLIENT_ID!, siteUrl: siteUrl(), state, codeChallenge });
  },
});

// The state must belong to the signed-in founder (CSRF binding) and be fresh; consumed exactly once.
export const consumeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const { profile } = await requireProfile(ctx);
    const row = await ctx.db.query("oauthStates").withIndex("by_state", (q) => q.eq("state", state)).unique();
    if (!row) throw new Error("Unknown or already used OAuth state");
    await ctx.db.delete(row._id);
    if (row.profileId !== profile._id) throw new Error("OAuth state does not belong to this account");
    if (Date.now() - row.createdAt > OAUTH_STATE_TTL_MS) throw new Error("OAuth state expired, please try again");
    return { profileId: profile._id, codeVerifier: row.codeVerifier, redirectTo: row.redirectTo };
  },
});

export const storeConnection = internalMutation({
  args: { profileId: v.id("profiles"), providerUserId: v.string(), handle: v.string(), name: v.optional(v.string()), avatarUrl: v.optional(v.string()), accessToken: v.string(), refreshToken: v.optional(v.string()), expiresAt: v.optional(v.number()), scopes: v.array(v.string()), followers: v.optional(v.number()) },
  handler: async (ctx, { followers, ...a }) => {
    const existing = await connectionOf(ctx, a.profileId);
    const doc = { ...a, provider: "x" as const, connectedAt: Date.now(), status: "active" as const, lastError: undefined };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("socialConnections", doc);
    const profile = await ctx.db.get(a.profileId);
    // Connecting is explicit permission to import: handle always, avatar only when the profile has none, followers whenever X returned them.
    await ctx.db.patch(a.profileId, { x: a.handle, xUserId: a.providerUserId, xConnectedAt: Date.now(), ...(profile && !profile.avatarUrl && a.avatarUrl ? { avatarUrl: a.avatarUrl } : {}), ...(followers === undefined ? {} : { xFollowers: followers, xFollowersAt: Date.now() }) });
  },
});

export const completeOAuth = action({
  args: { state: v.string(), code: v.string() },
  handler: async (ctx, { state, code }): Promise<{ handle: string; redirectTo?: string }> => {
    const clientId = process.env.X_CLIENT_ID;
    const clientSecret = process.env.X_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("X connection is not enabled on this deployment");
    const st = await ctx.runMutation(internal.social.consumeState, { state });
    const tokenRes = await fetch(X_TOKEN_URL, { method: "POST", headers: { Authorization: basicAuth(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: tokenRequestBody({ code, codeVerifier: st.codeVerifier, clientId, siteUrl: siteUrl() }) });
    if (!tokenRes.ok) throw new Error(describeXError(tokenRes.status, await tokenRes.text()));
    const token = parseTokenResponse(await tokenRes.json());
    const meRes = await fetch(X_ME_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!meRes.ok) throw new Error(describeXError(meRes.status, await meRes.text()));
    const me = (await meRes.json()) as XMe;
    if (!me.data?.id || !me.data.username) throw new Error("X did not return the account");
    await ctx.runMutation(internal.social.storeConnection, {
      profileId: st.profileId,
      providerUserId: me.data.id,
      handle: me.data.username,
      name: me.data.name,
      avatarUrl: me.data.profile_image_url?.replace("_normal", "_400x400"),
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
      scopes: token.scope?.split(" ") ?? [],
      followers: followersOf(me),
    });
    return { handle: me.data.username, redirectTo: st.redirectTo };
  },
});

export const connectionForOwner = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { profile } = await requireProfile(ctx);
    const c = await connectionOf(ctx, profile._id);
    return c ? { _id: c._id, accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt, status: c.status, profileId: profile._id, followersAt: profile.xFollowersAt } : null;
  },
});

export const removeConnection = internalMutation({
  args: { id: v.id("socialConnections") },
  handler: async (ctx, { id }) => {
    const { profile } = await requireProfile(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.profileId !== profile._id) return;
    await ctx.db.delete(id);
    await ctx.db.patch(profile._id, { xUserId: undefined, xConnectedAt: undefined, xFollowers: undefined, xFollowersAt: undefined });
  },
});

// Best-effort revocation at X; a failure never blocks forgetting the token on our side.
export async function revokeXToken(accessToken: string) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) return;
  await fetch(X_REVOKE_URL, { method: "POST", headers: { Authorization: basicAuth(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: accessToken, token_type_hint: "access_token", client_id: clientId }) }).catch(() => undefined);
}

// Revoke at X best-effort, then forget the tokens. The typed handle stays (it is the founder's, not X's).
export const disconnect = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    const c = await ctx.runQuery(internal.social.connectionForOwner, {});
    if (!c) return;
    await revokeXToken(c.accessToken);
    await ctx.runMutation(internal.social.removeConnection, { id: c._id });
  },
});

// ---- Follower counts --------------------------------------------------------------------------------------------------
// Free-tier X: only GET /2/users/me (the founder's own token) returns public_metrics. No lookup by handle ever happens.

type ConnectionTokens = { _id: Id<"socialConnections">; profileId: Id<"profiles">; accessToken: string; refreshToken?: string; expiresAt?: number; status: Doc<"socialConnections">["status"] };

export const connectionsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("socialConnections").filter((q) => q.eq(q.field("status"), "active")).paginate({ numItems: FOLLOWERS_PAGE_SIZE, cursor });
    return { rows: page.page.map((c): ConnectionTokens => ({ _id: c._id, profileId: c.profileId, accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt, status: c.status })), continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const setFollowers = internalMutation({
  args: { profileId: v.id("profiles"), followers: v.number() },
  handler: async (ctx, { profileId, followers }) => { await ctx.db.patch(profileId, { xFollowers: followers, xFollowersAt: Date.now() }); },
});

export const markConnectionError = internalMutation({
  args: { id: v.id("socialConnections"), error: v.string(), unauthorized: v.boolean() },
  handler: async (ctx, { id, error, unauthorized }) => { await ctx.db.patch(id, { lastError: error, ...(unauthorized ? { status: "error" as const } : {}) }); },
});

type RefreshResult = { ok: true; followers: number } | { ok: false; status: number; error: string };

// Refresh the token when needed, read /users/me, store the count. A 401 (or a dead refresh token) flags the connection
// for reconnecting exactly like the posting job does; every other failure is recorded and never thrown.
async function readFollowers(ctx: { runMutation: ActionCtx["runMutation"] }, c: ConnectionTokens): Promise<RefreshResult> {
  const fail = async (status: number, error: string): Promise<RefreshResult> => {
    await ctx.runMutation(internal.social.markConnectionError, { id: c._id, error, unauthorized: status === 401 });
    return { ok: false, status, error };
  };
  try {
    let token = c.accessToken;
    if (needsRefresh(c.expiresAt, Date.now())) {
      const clientId = process.env.X_CLIENT_ID;
      const clientSecret = process.env.X_CLIENT_SECRET;
      if (!clientId || !clientSecret || !c.refreshToken) return fail(401, "X token expired and cannot be refreshed");
      const r = await fetch(X_TOKEN_URL, { method: "POST", headers: { Authorization: basicAuth(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: refreshRequestBody({ refreshToken: c.refreshToken, clientId }) });
      if (!r.ok) return fail(r.status === 400 ? 401 : r.status, describeXError(r.status, await r.text()));
      const t = parseTokenResponse(await r.json());
      token = t.access_token;
      await ctx.runMutation(internal.social.updateTokens, { id: c._id, accessToken: t.access_token, refreshToken: t.refresh_token ?? c.refreshToken, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined });
    }
    const res = await fetch(X_ME_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return fail(res.status, describeXError(res.status, await res.text()));
    const followers = followersOf((await res.json()) as XMe);
    if (followers === undefined) return fail(res.status, "X did not return public metrics");
    await ctx.runMutation(internal.social.setFollowers, { profileId: c.profileId, followers });
    return { ok: true, followers };
  } catch (e) {
    return fail(0, (e as Error).message.slice(0, 200));
  }
}

// Daily, from the sweep: pages of 50 active connections, one action per page, chained through the scheduler.
// A 429 ends the run early (the rest is picked up tomorrow); a single failing founder never stops the others.
export const refreshFollowers = internalAction({
  args: { cursor: v.optional(v.string()), runId: v.optional(v.id("jobRuns")) },
  handler: async (ctx, { cursor, runId: prevRun }): Promise<{ refreshed: number; failed: number }> => {
    if (!oauthEnabled()) return { refreshed: 0, failed: 0 };
    const runId = prevRun ?? (await ctx.runMutation(internal.jobs.begin, { job: "follower refresh" }));
    if (runId === null) return { refreshed: 0, failed: 0 };
    try {
      const page = await ctx.runQuery(internal.social.connectionsPage, { cursor: cursor ?? null });
      let refreshed = 0;
      let failed = 0;
      let throttled = false;
      for (const c of page.rows) {
        const r = await readFollowers(ctx, c);
        if (r.ok) refreshed++;
        else failed++;
        if (!r.ok && r.status === 429) { throttled = true; break; }
      }
      const done = throttled || page.isDone;
      await ctx.runMutation(internal.jobs.record, { runId, items: refreshed + failed, errors: failed, done });
      if (!done) await ctx.scheduler.runAfter(0, internal.social.refreshFollowers, { cursor: page.continueCursor, runId });
      return { refreshed, failed };
    } catch (e) {
      await failActionRun(ctx, runId, "follower refresh", e);
      throw e;
    }
  },
});

// Settings → "Refresh now": one read per minute per founder; the same path the daily job uses.
export const refreshNow = action({
  args: {},
  handler: async (ctx): Promise<{ followers: number }> => {
    const c = await ctx.runQuery(internal.social.connectionForOwner, {});
    // ConvexError so the reason survives the action boundary (plain errors reach the client as "Server Error").
    if (!c || c.status !== "active") throw new ConvexError("Connect your X account first");
    if (c.followersAt !== undefined && Date.now() - c.followersAt < FOLLOWERS_REFRESH_COOLDOWN_MS) throw new ConvexError("Refreshed less than a minute ago, try again shortly");
    const r = await readFollowers(ctx, c);
    if (!r.ok) throw new ConvexError(r.error);
    return { followers: r.followers };
  },
});

// ---- Posting ----------------------------------------------------------------------------------------------------------

// Posted links are attributed per account (docs/ANALYTICS.md); the share page itself stays canonical.
const shareUrlFor = (slug: string, cardKind: string, channel: "x-founder" | "x-bot") => attributedUrl(`${siteUrl()}/s/${slug}/share/${cardKind}`, { ref: "share", source: channel, medium: "share-card", campaign: cardKind });

// Hourly. Queues at most one founder post per day per account and a handful of bot posts per day; every event is
// considered exactly once per account. Everything else stays a draft in the Share Center.
export const autoPost = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const st of await ctx.db.query("oauthStates").collect()) if (now - st.createdAt > OAUTH_STATE_TTL_MS) await ctx.db.delete(st._id);
    const bot = botCreds();
    if (!oauthEnabled() && !bot) return;
    const events = await ctx.db.query("shareEvents").withIndex("by_status_time", (q) => q.eq("status", "ready").gte("createdAt", now - EVENT_MAX_AGE_MS)).order("desc").take(200);
    let botToday = (await ctx.db.query("socialPosts").withIndex("by_account_time", (q) => q.eq("account", "usertrack").gte("createdAt", now - DAY)).collect()).filter((p) => p.status !== "failed").length;
    for (const e of events) {
      const saas = await ctx.db.get(e.saasId);
      const profile = await ctx.db.get(e.profileId);
      if (!saas || !profile || !saas.isPublic || saas.isDemo) continue;
      const prefs = normalizePrefs(profile.socialPrefs);
      const draft = (author: "founder" | "usertrack") => xDraft({ kind: e.kind as DraftKind, name: saas.name, value: e.value, title: e.title, totalUsers: saas.totalUsers, newUsers30d: saas.newUsers30d, growth30dPct: saas.growth30dPct, rank: e.rank, percentile: e.percentile, verified: saas.trust === "verified", author, founderHandle: author === "usertrack" && prefs.allowTagging ? profile.x : undefined, seed: e.key });

      if (oauthEnabled() && prefs.autoShare[e.category]) {
        const c = await connectionOf(ctx, profile._id);
        const dup = await ctx.db.query("socialPosts").withIndex("by_event_account", (q) => q.eq("shareEventId", e._id).eq("account", "founder")).first();
        const recent = (await ctx.db.query("socialPosts").withIndex("by_profile_time", (q) => q.eq("profileId", profile._id).gte("createdAt", now - FOUNDER_POST_COOLDOWN_MS)).collect()).some((p) => p.account === "founder" && p.status !== "failed");
        if (c && c.status === "active" && !dup && !recent) {
          const id = await ctx.db.insert("socialPosts", { profileId: profile._id, saasId: saas._id, shareEventId: e._id, account: "founder", provider: "x", text: `${draft("founder")}\n\n${shareUrlFor(saas.slug, e.cardKind, "x-founder")}`, status: "queued", createdAt: now });
          await ctx.scheduler.runAfter(0, internal.social.deliverPost, { postId: id });
        }
      }

      if (bot && botToday < BOT_DAILY_CAP && saas.trust === "verified" && prefs.allowPromotion && botWorthy({ kind: e.kind, value: e.value, verified: true })) {
        const dup = await ctx.db.query("socialPosts").withIndex("by_event_account", (q) => q.eq("shareEventId", e._id).eq("account", "usertrack")).first();
        if (!dup) {
          const id = await ctx.db.insert("socialPosts", { profileId: profile._id, saasId: saas._id, shareEventId: e._id, account: "usertrack", provider: "x", text: `${draft("usertrack")}\n\n${shareUrlFor(saas.slug, e.cardKind, "x-bot")}`, status: "queued", createdAt: now });
          await ctx.scheduler.runAfter(0, internal.social.deliverPost, { postId: id });
          botToday++;
        }
      }
    }
  },
});

export const postContext = internalQuery({
  args: { postId: v.id("socialPosts") },
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (!post) return null;
    const c = post.account === "founder" && post.profileId ? await connectionOf(ctx, post.profileId) : null;
    return { post, connection: c ? { _id: c._id, accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt, status: c.status } : null };
  },
});

export const updateTokens = internalMutation({
  args: { id: v.id("socialConnections"), accessToken: v.string(), refreshToken: v.optional(v.string()), expiresAt: v.optional(v.number()) },
  handler: async (ctx, { id, ...tokens }) => { await ctx.db.patch(id, tokens); },
});

export const markPosted = internalMutation({
  args: { postId: v.id("socialPosts"), providerPostId: v.string() },
  handler: async (ctx, { postId, providerPostId }) => {
    const post = await ctx.db.get(postId);
    if (!post) return;
    const now = Date.now();
    await ctx.db.patch(postId, { status: "posted", providerPostId, postedAt: now });
    if (post.account === "founder") {
      if (post.shareEventId) await ctx.db.patch(post.shareEventId, { status: "shared", sharedAt: now });
      const c = post.profileId ? await connectionOf(ctx, post.profileId) : null;
      if (c) await ctx.db.patch(c._id, { lastPostAt: now, lastError: undefined });
    }
  },
});

export const markFailed = internalMutation({
  args: { postId: v.id("socialPosts"), error: v.string(), unauthorized: v.optional(v.boolean()) },
  handler: async (ctx, { postId, error, unauthorized }) => {
    const post = await ctx.db.get(postId);
    if (!post) return;
    await ctx.db.patch(postId, { status: "failed", error });
    if (post.account === "founder" && post.profileId) {
      const c = await connectionOf(ctx, post.profileId);
      if (c) await ctx.db.patch(c._id, { lastError: error, ...(unauthorized ? { status: "error" as const } : {}) });
    }
  },
});

// One attempt, no aggressive retries: a failed post stays visible as a draft with its error.
export const deliverPost = internalAction({
  args: { postId: v.id("socialPosts") },
  handler: async (ctx, { postId }): Promise<void> => {
    const c = await ctx.runQuery(internal.social.postContext, { postId });
    if (!c || c.post.status !== "queued") return;
    const fail = async (error: string, unauthorized = false): Promise<void> => { await ctx.runMutation(internal.social.markFailed, { postId, error, unauthorized }); };
    try {
      let headers: Record<string, string>;
      if (c.post.account === "usertrack") {
        const creds = botCreds();
        if (!creds) return fail("UserTrack account credentials are not configured");
        headers = { Authorization: await oauth1Header(creds, "POST", X_TWEETS_URL) };
      } else {
        if (!c.connection || c.connection.status !== "active") return fail("No active X connection", true);
        let token = c.connection.accessToken;
        if (needsRefresh(c.connection.expiresAt, Date.now())) {
          const clientId = process.env.X_CLIENT_ID;
          const clientSecret = process.env.X_CLIENT_SECRET;
          if (!clientId || !clientSecret || !c.connection.refreshToken) return fail("X token expired and cannot be refreshed", true);
          const r = await fetch(X_TOKEN_URL, { method: "POST", headers: { Authorization: basicAuth(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: refreshRequestBody({ refreshToken: c.connection.refreshToken, clientId }) });
          if (!r.ok) return fail(describeXError(r.status, await r.text()), r.status === 401 || r.status === 400);
          const t = parseTokenResponse(await r.json());
          token = t.access_token;
          await ctx.runMutation(internal.social.updateTokens, { id: c.connection._id, accessToken: t.access_token, refreshToken: t.refresh_token ?? c.connection.refreshToken, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined });
        }
        headers = { Authorization: `Bearer ${token}` };
      }
      const res = await fetch(X_TWEETS_URL, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ text: c.post.text }) });
      if (!res.ok) return fail(describeXError(res.status, await res.text()), res.status === 401);
      const j = (await res.json()) as { data?: { id?: string } };
      await ctx.runMutation(internal.social.markPosted, { postId, providerPostId: j.data?.id ?? "unknown" });
    } catch (e) {
      await fail((e as Error).message.slice(0, 200));
    }
  },
});
