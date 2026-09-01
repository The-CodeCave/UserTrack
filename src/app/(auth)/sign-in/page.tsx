import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Panel className="p-6 sm:p-8">
      <SectionLabel>Sign in</SectionLabel>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Welcome back</h1>
      <Suspense><AuthForm mode="sign-in" /></Suspense>
    </Panel>
  );
}
