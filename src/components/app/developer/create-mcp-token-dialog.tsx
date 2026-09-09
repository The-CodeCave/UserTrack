"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { api } from "@convex/_generated/api";
import { DEFAULT_MCP_SCOPES, SCOPES, type Scope } from "@convex/lib/tokens";
import { AGENT_PROMPT, mcpSnippets } from "@/lib/mcp/snippets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyBlock, SecretReveal, errMsg } from "./copy-block";
import { CopyForAgent } from "@/components/site/copy-for-agent";
import { mcpAgentPrompt } from "@/lib/llm-prompts";
import { track } from "@/lib/analytics";

const EXPIRY = [
  { value: "0", label: "Never" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

export function CreateMcpTokenDialog() {
  const create = useMutation(api.tokens.create);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scopes, setScopes] = useState<Scope[]>(DEFAULT_MCP_SCOPES);
  const [expiry, setExpiry] = useState("0");
  const [secret, setSecret] = useState<string | null>(null);

  function reset() {
    setSecret(null);
    setScopes(DEFAULT_MCP_SCOPES);
    setExpiry("0");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (scopes.length === 0) return toast.error("Pick at least one scope");
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    setBusy(true);
    try {
      const r = await create({ type: "mcp", name, scopes, expiresInDays: Number(expiry) || undefined });
      track("token_created", { type: "mcp", origin: "dashboard" });
      setSecret(r.secret);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const snippets = secret ? mcpSnippets(secret) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) track("token_create_opened", { type: "mcp" }); else reset(); }}>
      <DialogTrigger render={<Button className="h-10" />}><Plus className="size-4" /> Create MCP token</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{secret ? "Your new MCP token" : "Create MCP token"}</DialogTitle>
          <DialogDescription>{secret ? "Add it to your coding agent, then paste the prompt." : "Lets an AI coding agent set up and read your projects. Scopes limit what it can do."}</DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="space-y-4">
            <SecretReveal secret={secret} />
            <Tabs defaultValue={snippets[0].id}>
              <TabsList variant="line" className="h-auto! max-w-full flex-wrap justify-start">
                {snippets.map((s) => <TabsTrigger key={s.id} value={s.id} className="flex-none font-mono text-[11px] uppercase tracking-wider">{s.label}</TabsTrigger>)}
              </TabsList>
              {snippets.map((s) => <TabsContent key={s.id} value={s.id} className="mt-2"><CopyBlock text={s.text} hint={s.hint} onCopy={() => track("mcp_config_copied", { client: s.id })} /></TabsContent>)}
            </Tabs>
            <CopyForAgent surface="mcp-token-dialog" label="Copy full setup for AI agent" prompt={mcpAgentPrompt({ token: secret })} hint="MCP config + token + the full setup plan in one paste." className="border border-pink/30 bg-pink/5 p-3" />
            <CopyBlock label="Short prompt for your agent" text={AGENT_PROMPT} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="h-10 flex-1" render={<Link href="/app/saas/new" />}><Sparkles className="size-4" /> Set up a project with AI</Button>
              <Button variant="outline" className="h-10" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name" className="text-label">Name</Label>
              <Input id="mcp-name" name="name" placeholder="e.g. Claude Code on my laptop" required maxLength={60} autoComplete="off" className="h-11 bg-background font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <div className="text-label">Scopes</div>
              <div className="divide-y divide-line border border-line">
                {SCOPES.map((s) => (
                  <label key={s.key} className="flex min-h-11 cursor-pointer items-start gap-3 p-3">
                    <input type="checkbox" checked={scopes.includes(s.key)} onChange={(e) => setScopes((prev) => (e.target.checked ? [...prev, s.key] : prev.filter((k) => k !== s.key)))} className="mt-0.5 size-4 shrink-0 accent-pink" />
                    <span className="min-w-0">
                      <span className="block text-sm">{s.label} <span className="font-mono text-[11px] text-muted-foreground">{s.key}</span></span>
                      <span className="block text-xs text-muted-foreground">{s.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-expiry" className="text-label">Expires</Label>
              <Select items={EXPIRY} value={expiry} onValueChange={(v) => setExpiry(String(v))}>
                <SelectTrigger id="mcp-expiry" className="h-11 w-full bg-background font-mono text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPIRY.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" className="h-10 w-full" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Create token</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
