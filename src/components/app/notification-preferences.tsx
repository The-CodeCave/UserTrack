"use client";

import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/blueprint/panel";
import { cn } from "@/lib/utils";

export type PrefKey = "productNudges" | "growthMilestones" | "rankingMilestones" | "growthAlerts" | "monthlyReport" | "weeklyDigest" | "followedSaasUpdates" | "followedMilestones" | "followedRanking" | "followedSpikes";
export type Prefs = Record<PrefKey, boolean>;

type Item = { key: PrefKey; label: string; hint: string; sub?: Item[] };
export const GROUPS: { title: string; blurb: string; items: Item[] }[] = [
  {
    title: "Setup",
    blurb: "Help finishing setup. Each reminder is sent once.",
    items: [{ key: "productNudges", label: "Setup reminders", hint: "Unfinished profile, product without a data source, first sync confirmation." }],
  },
  {
    title: "Growth",
    blurb: "Only at meaningful thresholds, never for small movements.",
    items: [
      { key: "growthMilestones", label: "User milestones", hint: "10 · 50 · 100 · 250 · 500 · 1K … 1M users." },
      { key: "rankingMilestones", label: "Ranking milestones", hint: "Entering the Top 100 / 50 / 25 / 10 / 5 or reaching #1." },
      { key: "growthAlerts", label: "Growth alerts", hint: "Signups 2.5× above your 30-day baseline (7-day cooldown), or zero signups for 7 days." },
    ],
  },
  {
    title: "Reports",
    blurb: "Delivered around 09:00 in your timezone.",
    items: [
      { key: "monthlyReport", label: "Monthly growth report", hint: "One email for all your products, on the 1st, covering the completed month." },
      { key: "weeklyDigest", label: "Weekly digest", hint: "Monday mornings: your week, followed products, movers, trending." },
    ],
  },
  {
    title: "Following",
    blurb: "About products and founders you follow.",
    items: [
      {
        key: "followedSaasUpdates", label: "Followed product updates", hint: "Only major milestones (1K+ users), Top 10 entries and exceptional spikes.",
        sub: [
          { key: "followedMilestones", label: "Milestones", hint: "1K+ user milestones of products you follow" },
          { key: "followedRanking", label: "Ranking changes", hint: "Top 10 entries and big 7-day climbs" },
          { key: "followedSpikes", label: "Growth spikes", hint: "3× above baseline" },
        ],
      },
    ],
  },
];

function Row({ item, checked, disabled, onChange, small }: { item: Item; checked: boolean; disabled?: boolean; onChange: (key: PrefKey, value: boolean) => void; small?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-default opacity-60")}>
      <div>
        <div className={cn("font-medium", small ? "text-xs" : "text-sm")}>{item.label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{item.hint}</div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(item.key, v)} />
    </label>
  );
}

export function NotificationPreferences({ prefs, onChange, disabled }: { prefs: Prefs; onChange: (key: PrefKey, value: boolean) => void; disabled?: boolean }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <Panel key={g.title} className="p-5">
          <div className="text-label">{g.title}</div>
          <p className="mt-1 text-xs text-muted-foreground">{g.blurb}</p>
          <div className="mt-4 space-y-4">
            {g.items.map((it) => (
              <div key={it.key} className="space-y-3">
                <Row item={it} checked={prefs[it.key]} disabled={disabled} onChange={onChange} />
                {it.sub && (
                  <div className={cn("ml-3 space-y-3 border-l border-line pl-4", !prefs[it.key] && "opacity-50")}>
                    {it.sub.map((sub) => <Row key={sub.key} item={sub} checked={prefs[sub.key] ?? true} disabled={disabled || !prefs[it.key]} onChange={onChange} small />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      ))}
      <Panel className="p-5">
        <div className="text-label">Always on</div>
        <p className="mt-1 text-xs text-muted-foreground">Account and security messages — password resets, email confirmation, and alerts when a data source stops syncing (your public page would go stale). These cannot be switched off.</p>
      </Panel>
    </div>
  );
}
