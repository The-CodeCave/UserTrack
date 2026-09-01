"use client";

import { useRouter } from "next/navigation";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { SaasForm } from "@/components/app/saas-form";

export default function NewSaasPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <SectionLabel>New SaaS</SectionLabel>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Add a product</h1>
      <Panel className="p-5">
        <SaasForm submitLabel="Create & connect source" onSaved={(id) => router.push(`/app/saas/${id}`)} />
      </Panel>
    </div>
  );
}
