"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

export function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" render={<a href={x} target="_blank" rel="noreferrer" onClick={() => track("share_intent_opened", { network: "x" })} />}><Share2 className="size-4" /> Share on X</Button>
      <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check className="size-4 text-pink" /> : <Copy className="size-4" />} Copy link
      </Button>
    </div>
  );
}
