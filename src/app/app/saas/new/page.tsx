"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { track as analytics } from "@/lib/analytics";
import type { PreviewDraft } from "@/lib/preview-draft";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { SaasForm } from "@/components/app/saas-form";
import { SiteStep } from "@/components/app/site-step";
import { PlatformTiles, type PlatformValue } from "@/components/app/platform-picker";
import { AiSetup } from "@/components/app/ai-setup";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpCallout } from "@/components/site/feedback";

type Mode = "site" | "details" | "ai";
const link = "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

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
  const [mode, setMode] = useState<Mode>(params.get("mode") === "ai" ? "ai" : "site");
  const [draft, setDraft] = useState<PreviewDraft | null>(null);
  const [platform, setPlatform] = useState<PlatformValue>({ projectType: "web" });
  const track = useMutation(api.onboarding.track);

  // The URL step answers the platform question too: a homepage linking to the App Store is a product with apps.
  function siteRead(d: PreviewDraft | null) {
    setDraft(d);
    setPlatform({ projectType: d?.projectType ?? "web", appStoreUrl: d?.appStoreUrl, playStoreUrl: d?.playStoreUrl });
    setMode("details");
    void track({ event: "platform_selected" });
  }

  const aiLink = (
    <button type="button" onClick={() => { setMode("ai"); void track({ event: "onboarding_ai_setup_selected" }); }} className={link}>Set up with AI instead</button>
  );

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <SectionLabel>New SaaS</SectionLabel>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Add a product</h1>
      {mode === "ai" ? (
        <AiSetup onDone={() => { analytics("project_created", { source: "mcp" }); void track({ event: "mcp_setup_completed" }); }} onSwitchToManual={() => setMode("site")} />
      ) : (
        <Panel className="p-5">
          {mode === "site" ? (
            <>
              <div className="text-label mb-1">Step 1 of 2 · Your website</div>
              <p className="mb-4 text-sm text-muted-foreground">Paste your live URL. Everything we can read off the page is filled in for you on the next step.</p>
              <SiteStep onDone={siteRead} after={aiLink} />
            </>
          ) : (
            <>
              <div className="text-label mb-1">Step 2 of 2 · Product details</div>
              <p className="mb-4 text-sm text-muted-foreground">Change anything that is wrong — nothing is saved until you press create.</p>
              <div className="mb-6 space-y-3">
                <Label className="text-label">What are you tracking?</Label>
                <PlatformTiles value={platform.projectType} onChange={(projectType) => setPlatform((p) => ({ ...p, projectType }))} />
                {platform.projectType !== "web" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <StoreField label="App Store URL (optional)" id="appStoreUrl" value={platform.appStoreUrl ?? ""} placeholder="https://apps.apple.com/app/id123456789" onChange={(appStoreUrl) => setPlatform((p) => ({ ...p, appStoreUrl }))} />
                    <StoreField label="Google Play URL (optional)" id="playStoreUrl" value={platform.playStoreUrl ?? ""} placeholder="https://play.google.com/store/apps/details?id=com.acme" onChange={(playStoreUrl) => setPlatform((p) => ({ ...p, playStoreUrl }))} />
                  </div>
                )}
              </div>
              <SaasForm fromPreview={draft} platform={platform} submitLabel="Create & connect source" onSaved={(id) => router.push(`/app/saas/${id}?created=1`)} />
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                <button type="button" onClick={() => setMode("site")} className={link}>Start over with a different URL</button>
                {aiLink}
              </div>
            </>
          )}
        </Panel>
      )}
      <HelpCallout surface="saas-new" className="mt-6" title="Not sure which option fits?">
        Tell me what your stack looks like and I will tell you exactly what to connect — or fix it for you if a provider misbehaves. Every message reaches me directly.
      </HelpCallout>
    </div>
  );
}

function StoreField({ label, id, value, placeholder, onChange }: { label: string; id: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-label">{label}</Label>
      <Input id={id} type="url" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-11 bg-background" />
    </div>
  );
}
