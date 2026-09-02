"use client";

import { Fragment } from "react";
import { useQuery } from "convex/react";
import { Info } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FACTORS = [["volume", "Volume"], ["growth", "Relative growth"], ["acceleration", "Acceleration"], ["trust", "Trust"], ["activation", "Activation"], ["freshness", "Freshness"], ["history", "History"]] as const;

// "Why is this trending?" — lists the public score factors for the 7d window.
export function TrendingExplain({ slug }: { slug: string }) {
  const t = useQuery(api.public.trendingExplain, { slug, window: "7d" });
  if (!t) return null;
  return (
    <Tooltip>
      <TooltipTrigger className="grid size-5 place-items-center border border-line text-muted-foreground hover:border-pink hover:text-pink" aria-label="Why is this trending?"><Info className="size-3" /></TooltipTrigger>
      <TooltipContent className="flex-col items-stretch p-3 text-left">
        <div className="flex items-baseline justify-between gap-4 font-mono text-[10px] uppercase tracking-wider opacity-70"><span>Trending score · 7d</span><span>{t.score ?? 0}{t.previousRank && t.rank ? ` · #${t.previousRank} → #${t.rank}` : ""}</span></div>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 font-mono text-[11px]">
          {FACTORS.map(([k, label]) => <Fragment key={k}><dt className="opacity-70">{label}</dt><dd className="tabular text-right">{t.factors[k].toFixed(2)}</dd></Fragment>)}
        </dl>
        {t.explain && <p className="mt-2 border-t border-background/20 pt-2 text-[11px]">{t.explain}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
