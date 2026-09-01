"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { GrowthChart } from "@/components/charts/growth-chart";
import type { Range } from "@/lib/format";

export function SaasGrowth({ slug, initialRange = "30d" }: { slug: string; initialRange?: Range }) {
  const [range, setRange] = useState<Range>(initialRange);
  const data = useQuery(api.public.series, { slug, range });
  return <GrowthChart data={data} range={range} onRangeChange={setRange} />;
}
