import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { CACHEABLE_PUBLIC, PUBLIC_CACHE_CONTROL } from "./src/lib/public-cache";
import { SENTRY_ENABLED, SENTRY_INGEST_ORIGIN } from "./src/lib/sentry";

const RYBBIT = process.env.NEXT_PUBLIC_RYBBIT_HOST || "https://rybbit.internal.thecodecave.de";
const csp = (frameAncestors: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${RYBBIT}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site ${RYBBIT} ${SENTRY_INGEST_ORIGIN}`,
    "frame-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
    // Only when the site itself is served over https; upgrading on http://localhost would break local builds.
    ...(process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];
// Routes third parties embed in iframes: framable by anyone, everything else denies framing.
const EMBEDDABLE = ["/embed/:slug*", "/api/badge/:slug*", "/api/embed/:slug*", "/widget.js"];


const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/trending-saas", destination: "/trending", permanent: true },
      { source: "/new-and-rising", destination: "/new-saas", permanent: true },
      { source: "/imprint", destination: "/impressum", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: csp("'none'") }] },
      { source: "/((?!embed/|api/badge/|api/embed/|widget\\.js).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      ...EMBEDDABLE.map((source) => ({ source, headers: [{ key: "Content-Security-Policy", value: csp("*") }] })),
      ...CACHEABLE_PUBLIC.map((source) => ({ source, headers: [{ key: "Cache-Control", value: PUBLIC_CACHE_CONTROL }] })),
      { source: "/widget.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }, { key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

// Only wrapped when a DSN is configured; source maps are uploaded only where an auth token exists (CI).
export default SENTRY_ENABLED
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      telemetry: false,
      disableLogger: true,
      silent: !process.env.CI,
    })
  : nextConfig;
