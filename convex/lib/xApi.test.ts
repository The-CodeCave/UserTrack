import { describe, expect, it } from "vitest";
import { authorizeUrl, describeXError, needsRefresh, parseTokenResponse, redirectUri, refreshRequestBody, tokenRequestBody } from "./xApi";

describe("X API builders", () => {
  it("builds the PKCE authorize URL with every required scope", () => {
    const u = new URL(authorizeUrl({ clientId: "cid", siteUrl: "https://usertrack.dev/", state: "s1", codeChallenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(u.searchParams.get("redirect_uri")).toBe("https://usertrack.dev/api/social/x/callback");
    expect(u.searchParams.get("scope")).toBe("tweet.read tweet.write users.read offline.access");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe("s1");
  });
  it("builds token bodies", () => {
    expect(tokenRequestBody({ code: "c", codeVerifier: "v", clientId: "cid", siteUrl: "https://usertrack.dev" }).get("grant_type")).toBe("authorization_code");
    expect(refreshRequestBody({ refreshToken: "r", clientId: "cid" }).get("grant_type")).toBe("refresh_token");
    expect(redirectUri("http://localhost:3000")).toBe("http://localhost:3000/api/social/x/callback");
  });
  it("parses and rejects token responses", () => {
    expect(parseTokenResponse({ access_token: "a", refresh_token: "r", expires_in: 7200 })).toEqual({ access_token: "a", refresh_token: "r", expires_in: 7200, scope: undefined });
    expect(() => parseTokenResponse({ error: "invalid_grant" })).toThrow(/access token/);
  });
  it("describes errors without leaking bodies", () => {
    expect(describeXError(401, JSON.stringify({ title: "Unauthorized" }))).toMatch(/Reconnect/);
    expect(describeXError(429, "")).toMatch(/rate limit/);
    expect(describeXError(500, "<html>")).toBe("X returned 500: <html>");
  });
  it("refreshes a minute before expiry", () => {
    expect(needsRefresh(undefined, 1000)).toBe(false);
    expect(needsRefresh(1000 + 30_000, 1000)).toBe(true);
    expect(needsRefresh(1000 + 120_000, 1000)).toBe(false);
  });
});

import { oauth1BaseString, oauth1Header } from "./xApi";

// The worked example from X's "Creating a signature" documentation.
const DOC = {
  creds: { consumerKey: "xvz1evFS4wEEPTGEFPHBog", consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", accessSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" },
  url: "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
  body: { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
  nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
  timestamp: 1318622958,
};

describe("OAuth 1.0a signing", () => {
  it("reproduces the documented signature base string and header", async () => {
    const base = oauth1BaseString("POST", DOC.url, { ...DOC.body, oauth_consumer_key: DOC.creds.consumerKey, oauth_nonce: DOC.nonce, oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(DOC.timestamp), oauth_token: DOC.creds.accessToken, oauth_version: "1.0" });
    expect(base.startsWith("POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26oauth_consumer_key%3D")).toBe(true);
    const header = await oauth1Header(DOC.creds, "POST", DOC.url, DOC.body, { nonce: DOC.nonce, timestamp: DOC.timestamp });
    expect(header).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
    expect(header.startsWith("OAuth oauth_consumer_key=")).toBe(true);
  });
});
