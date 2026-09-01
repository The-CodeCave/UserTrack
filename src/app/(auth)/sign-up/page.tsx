import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <Panel className="p-6 sm:p-8">
      <SectionLabel>Free forever</SectionLabel>
      <h1 className="mt-2 mb-1 text-2xl font-semibold tracking-tight">Start tracking</h1>
      <p className="mb-6 text-sm text-muted-foreground">Public growth page for your SaaS in under 3 minutes.</p>
      <Suspense><AuthForm mode="sign-up" /></Suspense>
    </Panel>
  );
}
