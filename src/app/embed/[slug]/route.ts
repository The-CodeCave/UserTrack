import { after } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { parseWidgetParams, widgetPageUrl } from "@/lib/embed";
import { renderWidgetHtml } from "@/lib/widget";
import { serverTrack } from "@/lib/analytics-server";
import { limit, take, tooMany } from "@/lib/api/rate-limit";
import { SITE_HOST, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const IGNORED_HOSTS = new Set([SITE_HOST, "localhost"]);

// Embedding host from the Referer (origin only under the default referrer policy). Own host + localhost never count.
function embedHost(referer: string | null) {
  try {
    const h = referer ? new URL(referer).hostname.toLowerCase().replace(/^www\./, "") : "";
    return h && !IGNORED_HOSTS.has(h) ? h : null;
  } catch {
    return null;
  }
}

// The iframe document behind /widget.js. HTML is never cached so every load can be attributed to its host.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rl = await limit(req, "embed");
  if (!rl.allowed) return tooMany(rl);
  const { slug } = await params;
  const p = parseWidgetParams(new URL(req.url).searchParams);
  const data = await fetchQuery(api.public.widget, { slug });
  const host = data ? embedHost(req.headers.get("referer")) : null;
  if (data) serverTrack(req, "embed_rendered", { widget: p.type });
  // At most one write per host and project per minute; loads are a signal, not analytics.
  if (host && take(`embed-site:${slug}:${host}`, Date.now(), 1).allowed) {
    after(() => fetchMutation(api.embeds.record, { gateway: process.env.UT_GATEWAY_SECRET, slug, host }).catch((e) => console.error("[embed] record", e)));
  }
  const html = renderWidgetHtml({ ...p, data, jsonUrl: `${SITE_URL}/api/embed/${slug}.json`, pageUrl: widgetPageUrl(SITE_URL, slug, p.type), homeUrl: `${SITE_URL}/?ref=embed` });
  return new Response(html, {
    status: data ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff" },
  });
}
