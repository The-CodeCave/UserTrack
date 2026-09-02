import { describe, expect, it } from "vitest";
import { postgres, countQuery, dailyQuery, rankTables, suggestColumns, validateSql, parseConnectionString, defaultSsl, createdAtKindFor } from "./postgres";
import { supabase } from "./supabase";
import { firebase } from "./firebase";
import { capabilitiesFromList, describeProvider, verificationLevel } from "./types";

const CONN = "postgresql://ro:pw@db.example.com:5432/app";

describe("postgres provider", () => {
  it("validates connection strings with actionable errors", () => {
    expect(parseConnectionString("mysql://x").ok).toBe(false);
    expect(parseConnectionString("postgres://host/db").ok).toBe(false);
    expect(parseConnectionString(CONN).ok).toBe(true);
    expect(postgres.validate({ connectionString: CONN }, "users")).toMatchObject({ ok: false, error: expect.stringContaining("table") });
    expect(postgres.validate({ connectionString: CONN, tableRef: "public.users; drop" }, "users").ok).toBe(false);
    expect(postgres.validate({ connectionString: CONN, tableRef: "users", createdAtColumn: "created at" }, "users").ok).toBe(false);
  });
  it("normalizes a users config and derives SSL", () => {
    const v = postgres.validate({ connectionString: "postgresql://ro:pw@localhost/app", tableRef: "users", createdAtColumn: "created_at", deletedAtColumn: "deleted_at" }, "users");
    expect(v.ok && v.config).toMatchObject({ schema: "public", table: "users", ssl: "disable", createdAtKind: "timestamp" });
    expect(defaultSsl("db.neon.tech", new URLSearchParams())).toBe("require");
    expect(defaultSsl("db.neon.tech", new URLSearchParams("sslmode=disable"))).toBe("disable");
    expect(postgres.runtime?.({} as never)).toBe("node");
  });
  it("builds aggregate SQL only", () => {
    const v = postgres.validate({ connectionString: CONN, tableRef: "auth.users", createdAtColumn: "created_at", deletedAtColumn: "deleted_at", statusColumn: "status", activeStatus: "active" }, "users");
    if (!v.ok) throw new Error(v.error);
    const q = countQuery(v.config, "2026-01-01T00:00:00Z");
    expect(q.text).toBe('SELECT count(*)::text AS n FROM "auth"."users" WHERE "deleted_at" IS NULL AND "status"::text = $1 AND "created_at" >= $2::timestamptz');
    expect(q.values).toEqual(["active", "2026-01-01T00:00:00Z"]);
    expect(countQuery(v.config).values).toEqual(["active"]);
    const d = dailyQuery({ ...v.config, createdAtKind: "epoch_ms", deletedAtColumn: undefined, statusColumn: undefined }, "2026-01-01T00:00:00Z");
    expect(d.text).toContain("to_timestamp(\"created_at\" / 1000.0)");
    expect(d.text).toContain("GROUP BY 1 ORDER BY 1");
  });
  it("accepts only read-only single-statement SQL for activation", () => {
    expect(validateSql("SELECT count(distinct user_id) FROM projects WHERE created_at >= $1")).toBeNull();
    expect(validateSql("with x as (select 1) select count(*) from x")).toBeNull();
    expect(validateSql("DELETE FROM users")).toMatch(/SELECT/);
    expect(validateSql("select 1; drop table users")).toMatch(/single/);
    expect(validateSql("select count(*) from users where id = $2")).toMatch(/\$1/);
    expect(validateSql("select pg_sleep(1) union select 1 from users where 1 = 1 and 'x' = 'x' -- update users")).toMatch(/read-only/);
    expect(postgres.validate({ connectionString: CONN, sql: "select count(*) from projects where created_at >= $1" }, "users").ok).toBe(false);
    const a = postgres.validate({ connectionString: CONN, sql: "select count(*) from projects where created_at >= $1" }, "activation");
    expect(a.ok && a.config.sql).toBeTruthy();
    expect(a.ok && countQuery(a.config, "2026-02-02T00:00:00Z").values).toEqual(["2026-02-02T00:00:00Z"]);
  });
  it("ranks likely user tables and suggests columns without exposing data", () => {
    const ranked = rankTables([
      { schema: "public", name: "posts", kind: "table", estimate: 90000 },
      { schema: "public", name: "users", kind: "table", estimate: 1200 },
      { schema: "auth", name: "users", kind: "table", estimate: 1200 },
      { schema: "public", name: "profiles", kind: "table", estimate: 1100 },
    ]);
    expect(ranked.map((t) => `${t.schema}.${t.name}`)).toEqual(["auth.users", "public.users", "public.profiles", "public.posts"]);
    const s = suggestColumns([
      { name: "id", type: "uuid", nullable: false },
      { name: "email", type: "text", nullable: false },
      { name: "created_at", type: "timestamp with time zone", nullable: false },
      { name: "deleted_at", type: "timestamp with time zone", nullable: true },
    ]);
    expect(s).toEqual({ idColumn: "id", createdAtColumn: "created_at", createdAtKind: "timestamp", deletedAtColumn: "deleted_at" });
    expect(createdAtKindFor("bigint")).toBe("epoch_ms");
    expect(createdAtKindFor("text")).toBeNull();
  });
  it("public config hides credentials", () => {
    const v = postgres.validate({ connectionString: "postgresql://ro:secretpw@db.abcdefghijklmnop.supabase.co:5432/postgres", tableRef: "auth.users" }, "users");
    if (!v.ok) throw new Error(v.error);
    const pub = JSON.stringify(postgres.publicConfig(v.config));
    expect(pub).not.toContain("secretpw");
    expect(pub).not.toContain("abcdefghijklmnop");
  });
});

describe("supabase provider modes", () => {
  it("database mode maps to auth.users with created_at", () => {
    const v = supabase.validate({ connectionString: "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" }, "users");
    if (!v.ok) throw new Error(v.error);
    expect(v.config.mode).toBe("database");
    expect(supabase.runtime?.(v.config)).toBe("node");
    expect(supabase.toPostgres?.(v.config, "users")).toMatchObject({ schema: "auth", table: "users", createdAtColumn: "created_at", deletedAtColumn: "deleted_at", ssl: "require" });
    expect(describeProvider(supabase, v.config, "users")).toMatchObject({ createdUsers: true, historicalUsers: true });
    expect(supabase.publicConfig(v.config).project).toBe("abcdefghijklmnopqrst");
  });
  it("rejects non-supabase hosts and keeps api mode working", () => {
    expect(supabase.validate({ connectionString: "postgresql://ro:pw@db.example.com/app" }, "users").ok).toBe(false);
    const api = supabase.validate({ url: "https://x.supabase.co", serviceKey: "k".repeat(30) }, "users");
    expect(api.ok && api.config.mode).toBe("api");
    expect(api.ok && supabase.runtime?.(api.config)).toBe("v8");
    expect(api.ok && describeProvider(supabase, api.config, "users").createdUsers).toBe(false);
    expect(supabase.validate({ url: "https://x.supabase.co", serviceKey: "k".repeat(30) }, "activation").ok).toBe(false);
  });
});

describe("capabilities + verification", () => {
  it("derives capabilities from the static list per role", () => {
    expect(capabilitiesFromList(["totalUsers", "activeUsers"], "users")).toMatchObject({ totalUsers: true, retention: true, createdUsers: false, traffic: false });
    expect(capabilitiesFromList(["activation", "traffic"], "traffic")).toMatchObject({ traffic: true, activationEvents: false });
  });
  it("labels sources honestly", () => {
    const caps = capabilitiesFromList(["totalUsers"], "users");
    expect(verificationLevel("firebase", "verified", caps, "users")).toBe("verified");
    expect(verificationLevel("manual", "unverified", caps, "users")).toBe("self_reported");
    expect(verificationLevel("endpoint", "unverified", caps, "users")).toBe("self_reported");
    expect(verificationLevel("posthog", "verified", capabilitiesFromList(["activation"], "activation"), "activation")).toBe("verified");
  });
  it("firebase declares the createdAt scan and can opt out", () => {
    const sa = JSON.stringify({ client_email: "a@b.iam", private_key: "-----BEGIN PRIVATE KEY-----x", project_id: "demo-app" });
    const v = firebase.validate({ serviceAccount: sa }, "users");
    expect(v.ok && describeProvider(firebase, v.config, "users").createdUsers).toBe(true);
    const off = firebase.validate({ serviceAccount: sa, scanSignups: false }, "users");
    expect(off.ok && describeProvider(firebase, off.config, "users").createdUsers).toBe(false);
  });
});
