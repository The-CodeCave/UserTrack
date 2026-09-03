import type { ConversionMode, Identities } from "@usertrack/protocol";

/** Time window for a count. Both bounds optional; `createdAtLt` is exclusive. */
export type CountWhere = { createdAtGte?: Date; createdAtLt?: Date };
/** A plain number, or `{ count, exact: false }` when the source hit a scan cap. */
export type CountResult = number | { count: number; exact: boolean };

export interface CountSource {
  count(where: CountWhere): Promise<CountResult>;
  /** false = the source cannot filter by time; 24h/7d/30d windows and the daily series are skipped. Default true. */
  timeFilter?: boolean;
}

export interface ConversionSource {
  converted: CountSource;
  trial?: CountSource;
  mode?: ConversionMode;
}

export interface Sources {
  users: CountSource;
  activation?: CountSource;
  conversion?: ConversionSource;
  /** Optional stable ids per lifecycle stage for cohort matching. Never emails. */
  identities?: () => Promise<Identities>;
}

/** Wraps a `(where) => Promise<number>` function into a CountSource. */
export const countSource = (count: (where: CountWhere) => Promise<CountResult>, timeFilter = true): CountSource => ({ count, timeFilter });
