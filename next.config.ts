import type { NextConfig } from "next";

const RYBBIT = "https://rybbit.internal.thecodecave.de";
const csp = (frameAncestors: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${RYBBIT}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site ${RYBBIT}`,
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
      { source: "/widget.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }, { key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

export default nextConfig;
