// Shared conversion model for payment providers. Every provider normalizes its subscriptions/orders into `SubRecord`s;
// this file turns them into lifecycle counts (trial / converted) for the configured conversion mode.
//
// Policy: payment providers are conversion-status sources only. Nothing here reads, keeps or returns amounts.
// A customer record is never a converted user by itself — only a paid state is.
import { DAY_MS, IDENTITY_CAP, ProviderError, type ConversionMode, type ProviderMetrics, type StageIdentities, str, DEFAULT_CONVERSION_MODE, CONVERSION_MODES } from "./types";

// Normalized state of one subscription / purchase relationship.
export type SubState = "trial" | "active" | "past_due" | "paused" | "canceled" | "expired" | "incomplete";

export interface SubRecord {
  // Stable pseudonymous subject: the product's own user id when the provider carries it (metadata), else the provider customer id.
  subject: string;
  state: SubState;
  // When the subject first paid (ms). Undefined = never paid (trial only, incomplete, unpaid trial cancel).
  paidAt?: number;
  // When the current/last trial started (ms), if any.
  trialAt?: number;
  // Anonymous ids (e.g. RevenueCat $RCAnonymousID) still count, but are never reported as identities.
  anonymous?: boolean;
}

export const ACTIVE_STATES: SubState[] = ["active", "past_due"];

const within = (ts: number | undefined, days: number, now: number) => ts !== undefined && ts >= now - days * DAY_MS && ts <= now;

// Distinct-subject counts per lifecycle stage. `complete` = the provider could list everything (else identities are partial).
export function aggregateConversion(records: SubRecord[], mode: ConversionMode, now = Date.now(), complete = true): ProviderMetrics {
  const bySubject = new Map<string, SubRecord[]>();
  for (const r of records) bySubject.set(r.subject, [...(bySubject.get(r.subject) ?? []), r]);
  const trial: { id: string; at?: number; anonymous?: boolean }[] = [];
  const converted: { id: string; at?: number; anonymous?: boolean }[] = [];
  let newTrials7d = 0, newTrials30d = 0, newConverted24h = 0, newConverted7d = 0, newConverted30d = 0;
  for (const [subject, subs] of bySubject) {
    const firstPaid = subs.reduce<number | undefined>((a, s) => (s.paidAt === undefined ? a : a === undefined ? s.paidAt : Math.min(a, s.paidAt)), undefined);
    const isActivePaid = subs.some((s) => ACTIVE_STATES.includes(s.state));
    const isTrialing = subs.some((s) => s.state === "trial") && !isActivePaid;
    const anonymous = subs.every((s) => s.anonymous);
    const latestTrial = subs.reduce<number | undefined>((a, s) => (s.trialAt === undefined ? a : a === undefined ? s.trialAt : Math.max(a, s.trialAt)), undefined);
    if (isTrialing) trial.push({ id: subject, at: latestTrial, anonymous });
    if (within(latestTrial, 7, now)) newTrials7d++;
    if (within(latestTrial, 30, now)) newTrials30d++;
    const isConverted = mode === "active_paid" ? isActivePaid : firstPaid !== undefined;
    if (isConverted) converted.push({ id: subject, at: firstPaid, anonymous });
    if (within(firstPaid, 1, now)) newConverted24h++;
    if (within(firstPaid, 7, now)) newConverted7d++;
    if (within(firstPaid, 30, now)) newConverted30d++;
  }
  const ids = (list: typeof trial) => list.filter((x) => !x.anonymous).slice(0, IDENTITY_CAP).map(({ id, at }) => ({ id, at }));
  const identities: StageIdentities[] = [
    { stage: "converted", ids: ids(converted), complete: complete && converted.length <= IDENTITY_CAP },
    { stage: "trial", ids: ids(trial), complete: complete && trial.length <= IDENTITY_CAP },
  ];
  return {
    trialUsers: trial.length,
    newTrials7d,
    newTrials30d,
    convertedUsers: converted.length,
    newConverted24h,
    newConverted7d,
    newConverted30d,
    conversionMode: mode,
    identities,
  };
}

export function parseMode(c: unknown): ConversionMode | null {
  const raw = str(c, "mode") || DEFAULT_CONVERSION_MODE;
  return (CONVERSION_MODES as string[]).includes(raw) ? (raw as ConversionMode) : null;
}

// Cursor pagination with a hard page cap so one huge account can never run a sync forever. Returns `complete=false` when capped.
export async function pageAll<T>(fetchPage: (cursor: string | null) => Promise<{ items: T[]; next: string | null }>, maxPages: number): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchPage(cursor);
    items.push(...res.items);
    if (!res.next || !res.items.length) return { items, complete: true };
    cursor = res.next;
  }
  return { items, complete: false };
}

export const MAX_PAGES = 50;

export function tooMany(label: string): never {
  throw new ProviderError(`${label} has more subscriptions than UserTrack lists in one sync (${MAX_PAGES} pages). Use the JSON endpoint provider with your own aggregate count.`, false);
}

// First stable user id from a metadata bag: userId / user_id / uid / app_user_id, else the fallback (provider customer id).
export function subjectFrom(meta: Record<string, unknown> | null | undefined, fallback: string) {
  for (const k of ["userId", "user_id", "uid", "app_user_id", "userID", "usertrack_user_id"]) {
    const v = meta?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return fallback;
}

export const sec = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v * 1000 : undefined);
export const iso = (v: unknown) => (typeof v === "string" && v ? (Number.isNaN(Date.parse(v)) ? undefined : Date.parse(v)) : undefined);
