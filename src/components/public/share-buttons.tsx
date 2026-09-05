"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { attributedUrl } from "@/lib/site";
import { Button } from "@/components/ui/button";

// `kind` is the utm_campaign (share kind, "page", "compare"); the page's canonical `url` itself stays clean.
export function ShareButtons({ url, text, kind = "page" }: { url: string; text: string; kind?: string }) {
  const [copied, setCopied] = useState(false);
  const link = (channel: string) => attributedUrl(url, { ref: "share", source: channel, medium: "share-card", campaign: kind });
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link("x"))}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" render={<a href={x} target="_blank" rel="noreferrer" onClick={() => track("share_intent_opened", { network: "x" })} />}><Share2 className="size-4" /> Share on X</Button>
      <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(link("link")); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />} Copy link
      </Button>
    </div>
  );
}
