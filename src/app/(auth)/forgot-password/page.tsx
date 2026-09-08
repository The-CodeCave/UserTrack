"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { track } from "@/lib/analytics";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setLoading(true);
    const res = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setLoading(false);
    if (res.error) {
      toast.error(res.error.message ?? "Something went wrong");
      return;
    }
    track("password_reset_requested");
    setSent(true);
  }

  return (
    <Panel className="p-6 sm:p-8">
      <SectionLabel>Password</SectionLabel>
      <h1 className="mt-2 mb-1 text-2xl font-semibold tracking-tight">Reset your password</h1>
      {sent ? (
        <p className="mt-2 text-sm text-muted-foreground">If an account exists for that address, a reset link is on its way. It is valid for one hour.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Enter your account email and we will send a one-time link.</p>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-label">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required className="h-11 bg-background" />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>{loading && <Loader2 className="size-4 animate-spin" />} Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground"><Link className="text-foreground underline-offset-4 hover:underline" href="/sign-in">Back to sign in</Link></p>
    </Panel>
  );
}
