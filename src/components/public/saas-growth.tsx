"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { GrowthChart } from "@/components/charts/growth-chart";
import type { Range } from "@/lib/format";

export function SaasGrowth({ slug, initialRange = "30d", compact }: { slug: string; initialRange?: Range; compact?: boolean }) {
  const [range, setRange] = useState<Range>(initialRange);
  const data = useQuery(api.public.series, { slug, range });
  const annotations = useQuery(api.public.annotations, { slug, range });
  return <GrowthChart data={data} annotations={annotations ?? []} range={range} onRangeChange={setRange} compact={compact} />;
}
