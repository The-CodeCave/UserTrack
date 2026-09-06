"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { SaasForm } from "@/components/app/saas-form";
import { PlatformStep, type PlatformValue } from "@/components/app/platform-picker";
import { AiSetup, SetupChooser } from "@/components/app/ai-setup";
import { Skeleton } from "@/components/ui/skeleton";

type Mode = "choose" | "ai" | "manual";

export default function NewSaasPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl p-4 sm:p-6"><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-72 w-full" /></div>}>
      <NewSaas />
    </Suspense>
  );
}

function NewSaas() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "ai" ? "ai" : "choose");
  const [platform, setPlatform] = useState<PlatformValue | null>(null);
  const track = useMutation(api.onboarding.track);

  function pick(m: "ai" | "manual") {
    setMode(m);
    void track({ event: m === "ai" ? "onboarding_ai_setup_selected" : "manual_setup_selected" });
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <SectionLabel>New SaaS</SectionLabel>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Add a product</h1>
      {mode === "ai" ? (
        <AiSetup onDone={() => track({ event: "mcp_setup_completed" })} onSwitchToManual={() => pick("manual")} />
      ) : (
        <Panel className="p-5">
          {mode === "manual" ? (
            <>
              <div className="text-label mb-4">{platform ? "Step 2 of 2 · Product details" : "Step 1 of 2 · What are you tracking?"}</div>
              {platform ? (
                <SaasForm platform={platform} submitLabel="Create & connect source" onSaved={(id) => router.push(`/app/saas/${id}?created=1`)} />
              ) : (
                <PlatformStep onSubmit={(v) => { setPlatform(v); void track({ event: "platform_selected" }); }} />
              )}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
                {platform && <button type="button" onClick={() => setPlatform(null)} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Change platform</button>}
                <button type="button" onClick={() => pick("ai")} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Set up with AI instead</button>
              </div>
            </>
          ) : (
            <SetupChooser onPick={pick} />
          )}
        </Panel>
      )}
    </div>
  );
}
