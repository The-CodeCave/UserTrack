import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/trending-saas", destination: "/trending", permanent: true },
      { source: "/new-and-rising", destination: "/new-saas", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/widget.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }, { key: "Access-Control-Allow-Origin", value: "*" }] }];
  },
};

export default nextConfig;
