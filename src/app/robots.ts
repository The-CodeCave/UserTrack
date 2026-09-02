import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/app/", "/api/auth", "/sign-in", "/sign-up", "/email/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
