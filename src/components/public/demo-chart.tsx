"use client";

import { useState } from "react";
import { GrowthChart, type SeriesPoint } from "@/components/charts/growth-chart";
import type { Range } from "@/lib/format";

// Deterministic sample series so the landing page always shows a live-feeling chart.
function sample(range: Range): SeriesPoint[] {
  const n = range === "24h" ? 7 : range === "7d" ? 42 : range === "30d" ? 30 : range === "90d" ? 90 : 120;
  const stepMs = range === "24h" ? 4 * 3.6e6 : range === "7d" ? 4 * 3.6e6 : 8.64e7;
  const now = Date.now();
  let total = range === "24h" ? 12_180 : range === "7d" ? 11_400 : range === "30d" ? 8_900 : range === "90d" ? 5_200 : 1_400;
  const pts: SeriesPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const wobble = Math.abs(Math.sin(i * 1.7)) * 0.6 + 0.7;
    const delta = Math.round(((12_400 - total) / (i + 4)) * wobble);
    pts.push({ t: now - i * stepMs, total, delta });
    total += delta;
  }
  return pts;
}

export function DemoChart() {
  const [range, setRange] = useState<Range>("30d");
  return <GrowthChart data={sample(range)} range={range} onRangeChange={setRange} />;
}
