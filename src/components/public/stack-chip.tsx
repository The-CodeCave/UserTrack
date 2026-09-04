import Link from "next/link";
import { techIconUrl, techLabel } from "@/lib/tech-stack";
import { cn } from "@/lib/utils";

// Brand icon rendered as a CSS mask so it takes the current text colour in both themes (one request, no theme swap).
export function StackIcon({ slug, className }: { slug: string; className?: string }) {
  const icon = techIconUrl(slug);
  if (!icon) return null;
  return <span aria-hidden className={cn("inline-block size-3.5 shrink-0 bg-current", className)} style={{ maskImage: `url(${icon})`, WebkitMaskImage: `url(${icon})`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />;
}

const chip = "inline-flex items-center gap-1.5 border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-pink hover:text-pink";

export function StackChip({ slug, link = true }: { slug: string; link?: boolean }) {
  const inner = <><StackIcon slug={slug} />{techLabel(slug)}</>;
  return link ? <Link href={`/stacks/${encodeURIComponent(slug)}`} className={chip}>{inner}</Link> : <span className={chip}>{inner}</span>;
}
