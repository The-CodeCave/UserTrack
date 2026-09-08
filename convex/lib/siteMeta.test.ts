import { describe, expect, it } from "vitest";
import { CATEGORY_SLUGS } from "../../src/lib/categories";
import { decodeEntities, detectSiteHints, parseSiteMeta, publicUrl, splitTitle, type SiteMeta } from "./siteMeta";

describe("publicUrl", () => {
  it("adds https and keeps public hosts", () => {
    expect(publicUrl("acme.com")?.toString()).toBe("https://acme.com/");
    expect(publicUrl(" https://acme.com/pricing ")?.pathname).toBe("/pricing");
  });
  it("refuses loopback, private ranges and non-http schemes", () => {
    for (const bad of ["localhost", "http://127.0.0.1", "http://10.0.0.5", "http://192.168.1.1", "http://172.16.0.9", "http://169.254.169.254", "http://metadata.google.internal", "file:///etc/passwd", "javascript:alert(1)", "http://box.local", "nodots"]) {
      expect(publicUrl(bad), bad).toBeNull();
    }
  });
});

describe("splitTitle", () => {
  it("takes the shorter outer segment as the brand", () => {
    expect(splitTitle("UserTrack — The growth data layer for SaaS")).toEqual({ name: "UserTrack", tagline: "The growth data layer for SaaS" });
    expect(splitTitle("The growth data layer for SaaS | UserTrack")).toEqual({ name: "UserTrack", tagline: "The growth data layer for SaaS" });
    expect(splitTitle("Acme - Analytics for teams").name).toBe("Acme");
  });
  it("leaves a single-segment title alone", () => {
    expect(splitTitle("Acme")).toEqual({ name: "Acme" });
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric references", () => {
    expect(decodeEntities("Ada &amp; Grace &#39;s &#x2764; caf&#233;")).toBe("Ada & Grace 's ❤ café");
  });
});

const HTML = `<!doctype html><html><head>
  <meta charset="utf-8">
  <title>Acme &mdash; Product analytics for indie SaaS</title>
  <meta name="description" content="See which SaaS   products are actually growing.">
  <link rel="icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
</head><body>…</body></html>`;

describe("parseSiteMeta", () => {
  it("reads name, description, tagline and the best icon", () => {
    const m = parseSiteMeta(HTML, "https://acme.com/");
    expect(m.name).toBe("Acme");
    expect(m.description).toBe("See which SaaS products are actually growing.");
    expect(m.valueProposition).toBe("Product analytics for indie SaaS");
    expect(m.iconUrl).toBe("https://acme.com/apple-touch-icon.png");
  });

  it("prefers og:site_name and og:description over the title", () => {
    const m = parseSiteMeta(`<head><meta property="og:site_name" content="Acme Inc"><meta property="og:description" content="Growth, verified."><title>Something else</title></head>`, "https://acme.com/");
    expect(m.name).toBe("Acme Inc");
    expect(m.description).toBe("Growth, verified.");
  });

  it("falls back to /favicon.ico and drops a tagline equal to the description", () => {
    const m = parseSiteMeta(`<head><title>Acme | Growth, verified</title><meta name="description" content="Growth, verified"></head>`, "https://acme.com/");
    expect(m.iconUrl).toBe("https://acme.com/favicon.ico");
    expect(m.valueProposition).toBeUndefined();
  });

  it("decodes entities inside attribute values so the icon URL is fetchable", () => {
    const m = parseSiteMeta(`<head><link rel="apple-touch-icon" sizes="180x180" href="https://cdn.acme.com/favicon.png?w=180&amp;h=180"></head>`, "https://acme.com/");
    expect(m.iconUrl).toBe("https://cdn.acme.com/favicon.png?w=180&h=180");
  });

  it("prefers a raster apple-touch-icon over an SVG or .ico", () => {
    const m = parseSiteMeta(
      `<head>
         <link rel="icon" type="image/svg+xml" href="/favicon.svg">
         <link rel="shortcut icon" href="/favicon.ico">
         <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
       </head>`,
      "https://acme.com/",
    );
    expect(m.iconUrl).toBe("https://acme.com/apple.png");
  });

  it("survives a page with no head metadata", () => {
    expect(parseSiteMeta("<html><body>hi</body></html>", "https://acme.com/")).toMatchObject({ name: undefined, description: undefined, iconUrl: "https://acme.com/favicon.ico" });
  });
});

const meta = (over: Partial<SiteMeta> = {}): SiteMeta => ({ url: "https://acme.com/", name: "Acme", description: "A product.", ...over });

describe("detectSiteHints", () => {
  it("reads providers off script and link assets", () => {
    const html = `<html><head>
      <link rel="preconnect" href="https://js.stripe.com">
      <script src="https://clerk.acme.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js"></script>
      <script src="https://eu.i.posthog.com/static/array.js"></script>
      <script src="https://js.stripe.com/v3/"></script>
    </head></html>`;
    expect(detectSiteHints(html, meta())).toMatchObject({ identity: "clerk", analytics: "posthog", monetization: "stripe" });
  });

  it("recognises an initialised SDK from an inline script", () => {
    const html = `<html><head><script>const s = Stripe("pk_live_123"); posthog.init("phc_1", {});</script></head></html>`;
    expect(detectSiteHints(html, meta())).toMatchObject({ analytics: "posthog", monetization: "stripe" });
  });

  it("never reads a provider out of prose, a link or an image", () => {
    const html = `<html><head><title>Acme</title></head><body>
      <p>We use Stripe for payments, Clerk for auth and PostHog for analytics.</p>
      <a href="https://stripe.com/partners">Powered by Stripe</a>
      <img src="https://cdn.acme.com/supabase-logo.png" alt="Firebase and Auth0">
    </body></html>`;
    expect(detectSiteHints(html, meta())).toEqual({ category: undefined });
  });

  it("takes the first table hit per key, so PostHog wins over GA4", () => {
    const html = `<html><head>
      <script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
      <script src="https://eu.posthog.com/static/array.js"></script>
    </head></html>`;
    expect(detectSiteHints(html, meta()).analytics).toBe("posthog");
  });

  it("falls back to GA4 when it is the only analytics on the page", () => {
    const html = `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-1"></script>`;
    expect(detectSiteHints(html, meta()).analytics).toBe("ga4");
  });

  it("resolves relative and protocol-relative assets against the page", () => {
    const html = `<script src="//js.stripe.com/v3/"></script><script src="/_next/static/chunk.js"></script>`;
    expect(detectSiteHints(html, meta()).monetization).toBe("stripe");
  });

  it("treats store links as a hybrid product and keeps both URLs", () => {
    const html = `<a href="https://apps.apple.com/us/app/acme/id123">iOS</a><a href="https://play.google.com/store/apps/details?id=com.acme">Android</a>`;
    expect(detectSiteHints(html, meta())).toMatchObject({
      projectType: "hybrid",
      appStoreUrl: "https://apps.apple.com/us/app/acme/id123",
      playStoreUrl: "https://play.google.com/store/apps/details?id=com.acme",
    });
  });

  it("guesses a category only when exactly one matches", () => {
    expect(detectSiteHints("", meta({ description: "Project management for remote teams." })).category).toBe("productivity");
    expect(detectSiteHints("", meta({ description: "No-code automation." })).category).toBe("no-code");
    // "AI-powered" and "analytics" both match: two answers means no answer.
    expect(detectSiteHints("", meta({ description: "AI-powered analytics for teams." })).category).toBeUndefined();
    expect(detectSiteHints("", meta({ description: "The best way to ship faster." })).category).toBeUndefined();
  });

  it("only guesses categories the product actually has", () => {
    for (const slug of ["ai", "developer-tools", "analytics", "marketing", "sales", "productivity", "fintech", "no-code", "design", "ecommerce", "education", "health", "social", "infrastructure"]) {
      expect(CATEGORY_SLUGS.has(slug), slug).toBe(true);
    }
  });
});
