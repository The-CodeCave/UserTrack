"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  return <Suspense><Inner /></Suspense>;
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const invalid = params.get("error") === "INVALID_TOKEN" || !token;
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const newPassword = String(new FormData(e.currentTarget).get("password"));
    setLoading(true);
    const res = await authClient.resetPassword({ newPassword, token });
    setLoading(false);
    if (res.error) {
      toast.error(res.error.message ?? "This link is no longer valid");
      return;
    }
    toast.success("Password updated — sign in with your new password");
    router.push("/sign-in");
  }

  return (
    <Panel className="p-6 sm:p-8">
      <SectionLabel>Password</SectionLabel>
      <h1 className="mt-2 mb-1 text-2xl font-semibold tracking-tight">{invalid ? "Link expired" : "Choose a new password"}</h1>
      {invalid ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Reset links are valid for one hour and can only be used once.</p>
          <Button className="mt-5 h-11 w-full" render={<Link href="/forgot-password" />}>Request a new link</Button>
        </>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-label">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required className="h-11 bg-background" />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>{loading && <Loader2 className="size-4 animate-spin" />} Update password</Button>
        </form>
      )}
    </Panel>
  );
}
