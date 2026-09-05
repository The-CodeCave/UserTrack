import { SITE_HOST } from "@/lib/site";

const IGNORED_HOSTS = new Set([SITE_HOST, "localhost"]);

// Embedding host from the Referer (origin only under the default referrer policy). Own host + localhost never count.
export function embedHost(referer: string | null) {
  try {
    const h = referer ? new URL(referer).hostname.toLowerCase().replace(/^www\./, "") : "";
    return h && !IGNORED_HOSTS.has(h) ? h : null;
  } catch {
    return null;
  }
}
