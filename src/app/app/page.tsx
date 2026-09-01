import type { Metadata } from "next";
import { SectionLabel } from "@/components/blueprint/section-label";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <SectionLabel>Overview</SectionLabel>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your growth at a glance</h1>
      <p className="mt-1 text-sm text-muted-foreground">Metrics land here once your first SaaS is connected.</p>
    </div>
  );
}
