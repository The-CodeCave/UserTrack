"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Database, Loader2, Search, ShieldCheck, Table2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { track } from "@/lib/analytics";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/providers-ui";
import { CapabilityList, TestResultCard, type TestResult } from "./test-result";

type Introspect = FunctionReturnType<typeof api.integrations.introspectPostgres>;
type Tables = Extract<Introspect, { ok: true; tables: unknown }>["tables"];
type Columns = Extract<Introspect, { ok: true; columns: unknown }>;
type Step = "connect" | "table" | "columns" | "confirm";
type Ssl = "auto" | "require" | "disable";

const errMsg = (err: unknown) => (err as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0];
const STEPS: { key: Step; label: string }[] = [
  { key: "connect", label: "Connect" },
  { key: "table", label: "Table" },
  { key: "columns", label: "Columns" },
  { key: "confirm", label: "Confirm" },
];

// Guided read-only Postgres setup: connection → table → columns → preview → connect. Never shows row data.
export function PostgresWizard({ saasId, role, provider = "postgres", onConnected, onCancel }: { saasId: Id<"saas">; role: Role; provider?: "postgres" | "supabase"; onConnected?: () => void; onCancel?: () => void }) {
  const introspect = useAction(api.integrations.introspectPostgres);
  const test = useAction(api.integrations.test);
  const connect = useMutation(api.integrations.connect);
  const [step, setStep] = useState<Step>("connect");
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState("");
  const [ssl, setSsl] = useState<Ssl>("auto");
  const [server, setServer] = useState("");
  const [tables, setTables] = useState<Tables>([]);
  const [filter, setFilter] = useState("");
  const [table, setTable] = useState("");
  const [cols, setCols] = useState<Columns | null>(null);
  const [mapping, setMapping] = useState({ idColumn: "", createdAtColumn: "", createdAtKind: "timestamp", deletedAtColumn: "", statusColumn: "", activeStatus: "" });
  const [mode, setMode] = useState<"table" | "sql">("table");
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const isSupabase = provider === "supabase";

  const config = () =>
    mode === "sql"
      ? { connectionString: conn, ssl: ssl === "auto" ? undefined : ssl, sql }
      : isSupabase
        ? { connectionString: conn, ssl: ssl === "auto" ? undefined : ssl, table: table === "auth.users" ? undefined : table, createdAtColumn: mapping.createdAtColumn || undefined }
        : { connectionString: conn, ssl: ssl === "auto" ? undefined : ssl, tableRef: table, idColumn: mapping.idColumn || undefined, createdAtColumn: mapping.createdAtColumn || undefined, createdAtKind: mapping.createdAtKind, deletedAtColumn: mapping.deletedAtColumn || undefined, statusColumn: mapping.statusColumn || undefined, activeStatus: mapping.activeStatus || undefined };

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    const r = await run(() => introspect({ saasId, connectionString: conn.trim(), ssl: ssl === "auto" ? undefined : ssl }));
    if (!r) return;
    if (!r.ok) return toast.error(r.error);
    if (!("tables" in r)) return;
    setServer(r.server);
    setTables(r.tables);
    const auth = r.tables.find((t) => t.schema === "auth" && t.name === "users");
    if (isSupabase && auth) {
      setTable("auth.users");
      setMapping((m) => ({ ...m, createdAtColumn: "created_at", createdAtKind: "timestamp", deletedAtColumn: "deleted_at" }));
    }
    setStep("table");
    track("postgres_wizard_step", { step: 2 });
    toast.success(`Connected to ${r.server}`);
  }

  async function chooseTable(ref: string) {
    setTable(ref);
    const r = await run(() => introspect({ saasId, connectionString: conn.trim(), ssl: ssl === "auto" ? undefined : ssl, table: ref }));
    if (!r) return;
    if (!r.ok) return toast.error(r.error);
    if (!("columns" in r)) return;
    setCols(r);
    setMapping({ idColumn: r.suggested.idColumn ?? "", createdAtColumn: r.suggested.createdAtColumn ?? "", createdAtKind: r.suggested.createdAtKind ?? "timestamp", deletedAtColumn: r.suggested.deletedAtColumn ?? "", statusColumn: "", activeStatus: "" });
    setStep("columns");
    track("postgres_wizard_step", { step: 3 });
  }

  async function preview() {
    const r = await run(() => test({ saasId, role, provider, config: config() }));
    if (!r) return;
    setResult(r);
    if (r.ok) {
      setStep("confirm");
      track("postgres_wizard_step", { step: 4 });
    }
    else toast.error(r.error);
  }

  async function finish() {
    const ok = await run(async () => {
      await connect({ saasId, role, provider, config: config() });
      return true;
    });
    if (ok) {
      toast.success("Connected — fetching the first snapshot");
      onConnected?.();
    }
  }

  const visible = tables.filter((t) => !filter || `${t.schema}.${t.name}`.includes(filter.toLowerCase()));
  const tsCols = cols?.columns.filter((c) => /timestamp|date|bigint|integer|numeric/i.test(c.type)) ?? [];

  return (
    <div className="space-y-5">
      <ol className="grid grid-cols-4 gap-1">
        {STEPS.map((s, i) => {
          const idx = STEPS.findIndex((x) => x.key === step);
          return (
            <li key={s.key} className="space-y-1.5">
              <div className={cn("h-0.5", i < idx ? "bg-pink" : i === idx ? "bg-foreground" : "bg-line")} />
              <div className={cn("font-mono text-[10px] uppercase tracking-wider", i === idx ? "text-foreground" : "text-muted-foreground")}>{s.label}</div>
            </li>
          );
        })}
      </ol>

      {step === "connect" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 border border-line bg-background/60 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-pink" />
            <div>
              <div className="text-foreground">Read-only, aggregates only.</div>
              UserTrack runs <code className="font-mono">count(*)</code> queries in a read-only session and never selects rows. Use a dedicated role: <code className="font-mono">GRANT SELECT ON {isSupabase ? "auth.users" : "public.users"} TO usertrack_ro;</code>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pg-conn" className="text-label">{isSupabase ? "Supabase connection string" : "Connection string"}</Label>
            <Input id="pg-conn" type="password" value={conn} onChange={(e) => setConn(e.target.value)} placeholder={isSupabase ? "postgresql://postgres.<ref>:…@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" : "postgresql://usertrack_ro:…@host:5432/db?sslmode=require"} className="h-11 bg-background font-mono text-sm" autoComplete="off" spellCheck={false} />
            <p className="font-mono text-[11px] text-muted-foreground">{isSupabase ? "Supabase → Connect → Session pooler (IPv4). Stored server-side, never shown again." : "The host must accept connections from the internet (or use your provider's pooler). Stored server-side, never shown again."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-label">SSL</span>
            <div className="flex border border-line">
              {(["auto", "require", "disable"] as Ssl[]).map((s) => (
                <button key={s} type="button" onClick={() => setSsl(s)} className={cn("px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider", ssl === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{s}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11" onClick={testConnection} disabled={busy || conn.trim().length < 12}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} Test connection</Button>
            {onCancel && <Button variant="ghost" className="h-11" onClick={onCancel}>Cancel</Button>}
          </div>
        </div>
      )}

      {step === "table" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm"><span className="text-pink">✓</span> Connected to <span className="font-mono text-xs">{server}</span></div>
            <span className="font-mono text-[11px] text-muted-foreground">{tables.length} readable tables</span>
          </div>
          {role === "activation" && (
            <div className="flex border border-line">
              {(["table", "sql"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex-1 px-3 py-2 font-mono text-[11px] uppercase tracking-wider", mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{m === "table" ? "One row per activated user" : "Custom SQL count"}</button>
              ))}
            </div>
          )}
          {mode === "sql" ? (
            <div className="space-y-2">
              <Label htmlFor="pg-sql" className="text-label">Read-only SELECT · $1 = since timestamp</Label>
              <Textarea id="pg-sql" value={sql} onChange={(e) => setSql(e.target.value)} rows={4} placeholder="SELECT count(distinct user_id) FROM projects WHERE created_at >= $1" className="bg-background font-mono text-xs" spellCheck={false} />
              <p className="font-mono text-[11px] text-muted-foreground">Runs with $1 = 1970 for the total and now − 1/7/30 days for the windows. Single statement, 20s timeout.</p>
              <div className="flex gap-2"><Button variant="ghost" className="h-10" onClick={() => setStep("connect")}><ArrowLeft className="size-4" /> Back</Button><Button className="h-10" onClick={preview} disabled={busy || sql.trim().length < 10}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Preview</Button></div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tables" className="h-10 bg-background pl-9" />
              </div>
              <div className="max-h-72 divide-y divide-line overflow-y-auto border border-line">
                {visible.slice(0, 60).map((t) => {
                  const ref = `${t.schema}.${t.name}`;
                  return (
                    <button key={ref} type="button" onClick={() => chooseTable(ref)} disabled={busy} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted", table === ref && "bg-pink/5")}>
                      <Table2 className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{ref}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t.kind}</span>
                      <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">~{formatCompact(t.estimate)}</span>
                    </button>
                  );
                })}
                {visible.length === 0 && <div className="p-4 text-sm text-muted-foreground">No readable tables match. Grant SELECT to this role or check the schema.</div>}
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">Row counts are planner estimates. Pick the table (or view) with exactly one row per {role === "activation" ? "activated user" : "user"}.</p>
              <Button variant="ghost" className="h-10" onClick={() => setStep("connect")}><ArrowLeft className="size-4" /> Back</Button>
            </>
          )}
        </div>
      )}

      {step === "columns" && cols && (
        <div className="space-y-4">
          <div className="flex items-center justify-between"><div className="font-mono text-xs">{table}</div><div className="font-mono text-[11px] text-muted-foreground">{formatCompact(cols.total)} rows now</div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColumnSelect label={role === "activation" ? "Activated-at timestamp" : "Signup timestamp"} value={mapping.createdAtColumn} onChange={(v) => setMapping((m) => ({ ...m, createdAtColumn: v, createdAtKind: kindOf(cols, v) }))} options={tsCols} hint={role === "activation" ? "Required" : "Optional · unlocks 24h / 7d / 30d signups and 30-day history"} />
            <ColumnSelect label="Stable user ID" value={mapping.idColumn} onChange={(v) => setMapping((m) => ({ ...m, idColumn: v }))} options={cols.columns} hint="Optional · documentation only" />
            <ColumnSelect label="Soft-delete column" value={mapping.deletedAtColumn} onChange={(v) => setMapping((m) => ({ ...m, deletedAtColumn: v }))} options={cols.columns.filter((c) => c.nullable)} hint="Optional · rows with a value are excluded" />
            <div className="space-y-1.5">
              <ColumnSelect label="Status column" value={mapping.statusColumn} onChange={(v) => setMapping((m) => ({ ...m, statusColumn: v }))} options={cols.columns} hint="Optional · count only rows with this value" />
              {mapping.statusColumn && <Input value={mapping.activeStatus} onChange={(e) => setMapping((m) => ({ ...m, activeStatus: e.target.value }))} placeholder="active" className="h-10 bg-background font-mono text-sm" />}
            </div>
          </div>
          {mapping.createdAtColumn && mapping.createdAtKind !== "timestamp" && <p className="font-mono text-[11px] text-muted-foreground">Numeric column detected — interpreted as epoch {mapping.createdAtKind === "epoch_ms" ? "milliseconds" : "seconds"}. <button type="button" className="underline" onClick={() => setMapping((m) => ({ ...m, createdAtKind: m.createdAtKind === "epoch_ms" ? "epoch_s" : "epoch_ms" }))}>Switch</button></p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ghost" className="h-10" onClick={() => setStep("table")}><ArrowLeft className="size-4" /> Back</Button>
            <Button className="h-10" onClick={preview} disabled={busy || (role === "activation" && !mapping.createdAtColumn)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Preview metrics</Button>
          </div>
        </div>
      )}

      {step === "confirm" && result && (
        <div className="space-y-4">
          <TestResultCard r={result} role={role} />
          {result.ok && <CapabilityList caps={result.capabilities} />}
          <p className="text-xs text-muted-foreground">Nothing is stored yet. Connecting stores the connection string server-side (never returned to the dashboard, the API or an agent), takes the first snapshot now and syncs every 4 hours.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ghost" className="h-11" onClick={() => setStep(mode === "sql" ? "table" : "columns")}><ArrowLeft className="size-4" /> Back</Button>
            <Button className="h-11" onClick={finish} disabled={busy || !result.ok}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Connect &amp; take first snapshot <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function kindOf(cols: Columns, name: string) {
  const c = cols.columns.find((x) => x.name === name);
  const t = c?.type.toLowerCase() ?? "";
  return t.includes("timestamp") || t === "date" ? "timestamp" : t === "integer" ? "epoch_s" : "epoch_ms";
}

function ColumnSelect({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: { name: string; type: string }[]; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-label">{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full border border-input bg-background px-3 font-mono text-sm">
        <option value="">—</option>
        {options.map((c) => <option key={c.name} value={c.name}>{c.name} · {c.type}</option>)}
      </select>
      {hint && <p className="font-mono text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
