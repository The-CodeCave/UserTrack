import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { cn } from "@/lib/utils";

// Public pages render this instead of crashing when Convex cannot be reached (docs/ARCHITECTURE.md → Degraded reads).
export function DegradedNotice({ className }: { className?: string }) {
  return (
    <Panel className={cn("p-6 text-center", className)}>
      <SectionLabel className="justify-center">Live data</SectionLabel>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">Live data is temporarily unavailable</h2>
      <p className="mt-1 text-sm text-muted-foreground">We could not reach the growth database. Nothing is lost — reload in a minute and the rankings are back.</p>
    </Panel>
  );
}

export function DegradedPage({ title, intro, eyebrow }: { title: string; intro: string; eyebrow?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <SectionLabel>{eyebrow ?? "Board"}</SectionLabel>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{intro}</p>
      <DegradedNotice className="mt-8" />
    </div>
  );
}
