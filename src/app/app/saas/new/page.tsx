"use client";

import { useState } from "react";
import { AddSaas } from "@/components/app/add-saas";
import { AiDone, type AiSetupProject } from "@/components/app/ai-setup";
import { SectionLabel } from "@/components/blueprint/section-label";
import { HelpCallout } from "@/components/site/feedback";

export default function NewSaasPage() {
  const [done, setDone] = useState<AiSetupProject | null>(null);
  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <SectionLabel>New SaaS</SectionLabel>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Add a product</h1>
      {done ? <AiDone project={done} /> : <AddSaas onDone={setDone} />}
      <HelpCallout surface="saas-new" className="mt-6" title="Stuck on a step?">
        Tell me what your stack looks like and I will tell you exactly what to connect — or fix it for you if a provider misbehaves. Every message reaches me directly.
      </HelpCallout>
    </div>
  );
}
