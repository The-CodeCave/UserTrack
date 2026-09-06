import { describe, expect, it } from "vitest";
import { decodeEntities, parseSiteMeta, publicUrl, splitTitle } from "./siteMeta";

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
