"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { errMsg } from "./copy-block";
import { track } from "@/lib/analytics";

export type Token = FunctionReturnType<typeof api.tokens.list>[number];

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("border border-line bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground", className)}>{children}</span>;
}

export function TokenList({ tokens, empty }: { tokens: Token[]; empty: string }) {
  if (tokens.length === 0) return <div className="border border-dashed border-line p-6 text-center text-sm text-muted-foreground">{empty}</div>;
  return <div className="divide-y divide-line border border-line">{tokens.map((t) => <TokenRow key={t.id} token={t} />)}</div>;
}

function TokenRow({ token: t }: { token: Token }) {
  const revoke = useMutation(api.tokens.revoke);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = t.active ? "active" : t.revokedAt ? "revoked" : "expired";

  async function onRevoke() {
    setBusy(true);
    try {
      await revoke({ id: t.id });
      track("token_revoked");
      toast.success(`Revoked ${t.name}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between", !t.active && "opacity-60")}>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t.name}</span>
          <Chip className={cn("uppercase tracking-wider", t.active && "border-pink/40 text-pink")}>{status}</Chip>
          {t.origin === "onboarding" && <Chip>onboarding</Chip>}
        </div>
        <div className="break-all font-mono text-[12px] text-muted-foreground">{t.masked}</div>
        <div className="tabular font-mono text-[11px] text-muted-foreground">
          created {formatDate(t.createdAt)} · last used {t.lastUsedAt ? timeAgo(t.lastUsedAt) : "never"} · today {t.usage.today} / {t.usage.perDay}
          {t.expiresAt ? ` · ${status === "expired" ? "expired" : "expires"} ${formatDate(t.expiresAt)}` : ""}
        </div>
        {t.type === "mcp" && <div className="flex flex-wrap gap-1">{t.scopes.map((s) => <Chip key={s}>{s}</Chip>)}</div>}
      </div>
      {t.active && (
        <div className="flex shrink-0 items-center gap-2">
          {confirm ? (
            <>
              <Button variant="destructive" size="sm" className="h-10 sm:h-8" onClick={onRevoke} disabled={busy}>Confirm revoke</Button>
              <Button variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => setConfirm(true)}>Revoke</Button>
          )}
        </div>
      )}
    </div>
  );
}
