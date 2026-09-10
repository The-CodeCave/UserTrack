"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircle2, Loader2, Sparkles, Wrench } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { activationAgentPrompt } from "@/lib/llm-prompts";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TokenSetup, errMsg } from "@/components/app/ai-setup";
import { toast } from "sonner";

type AgentSession = { tokenId: Id<"developerTokens">; secret: string };

export function ActivationAgentSetup({ saasId, name, websiteUrl, connected, onManual, onDone }: { saasId: Id<"saas">; name: string; websiteUrl: string; connected: boolean; onManual: () => void; onDone: () => void }) {
  const createToken = useMutation(api.tokens.create);
  const [context, setContext] = useState("");
  const [session, setSession] = useState<AgentSession | null>(null);
  const [creating, setCreating] = useState(false);

  async function prepare() {
    setCreating(true);
    try {
      const token = await createToken({ type: "mcp", name: `Activation setup · ${name}`.slice(0, 60), origin: "onboarding", expiresInDays: 7 });
      setSession({ tokenId: token.id, secret: token.secret });
      track("token_created", { type: "mcp", origin: "activation" });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setCreating(false);
    }
  }

  if (connected) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-pink" />
          <div><div className="text-sm font-medium">Activation source connected</div><p className="mt-1 text-xs text-muted-foreground">The agent finished the setup. Activation metrics will appear after the first sync.</p></div>
        </div>
        <Button size="sm" onClick={onDone}>View engagement</Button>
      </div>
    );
  }

  const prompt = session ? activationAgentPrompt({ token: session.secret, project: { id: saasId, name, websiteUrl }, context }) : "";
  const shortPrompt = `Define the activation event for ${name} from the code in this repo and connect it to the existing UserTrack project ${saasId}. If the product meaning is ambiguous, ask me one concise question before changing anything.`;

  return (
    <div className="space-y-5">
      <div className="border border-pink/40 bg-pink/5 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-pink" />
          <div>
            <div className="text-sm font-medium">Let your coding agent find the activation event</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">It inspects the product, ranks real outcome events, asks one focused question only if the definition is ambiguous, then wires and verifies the safest source.</p>
          </div>
        </div>
        {!session && (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="activation-context" className="text-label">What does a successful first session look like? <span className="normal-case tracking-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="activation-context" value={context} onChange={(event) => setContext(event.target.value)} rows={3} placeholder="Example: A user gets value after importing their first call and receiving the summary." className="bg-background text-sm" />
              <p className="font-mono text-[11px] text-muted-foreground">Leave this empty if the repository already makes it obvious.</p>
            </div>
            <Button type="button" onClick={prepare} disabled={creating} className="h-11">
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Prepare agent setup
            </Button>
          </div>
        )}
      </div>

      {session && <TokenSetup secret={session.secret} prompt={prompt} shortPrompt={shortPrompt} onCopyPrompt={() => {}} />}

      <button type="button" onClick={onManual} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <Wrench className="size-3.5" /> Set up a provider manually instead
      </button>
    </div>
  );
}
