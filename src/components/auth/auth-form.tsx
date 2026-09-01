"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).trim();
    const password = String(fd.get("password"));
    const name = String(fd.get("name") ?? "").trim();
    setLoading(true);
    const res =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      toast.error(res.error.message ?? "Something went wrong");
      return;
    }
    router.push(mode === "sign-up" ? "/app/onboarding" : next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "sign-up" && (
        <Field label="Name" name="name" placeholder="Ada Lovelace" autoComplete="name" required />
      )}
      <Field label="Email" name="email" type="email" placeholder="you@company.com" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        placeholder={mode === "sign-up" ? "At least 8 characters" : "••••••••"}
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        minLength={8}
        required
      />
      <Button type="submit" className="h-11 w-full" disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "sign-up" ? (
          <>Already tracking? <Link className="text-foreground underline-offset-4 hover:underline" href="/sign-in">Sign in</Link></>
        ) : (
          <>New here? <Link className="text-foreground underline-offset-4 hover:underline" href="/sign-up">Create a free account</Link></>
        )}
      </p>
    </form>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-label">{label}</Label>
      <Input id={name} name={name} className="h-11 bg-background" {...props} />
    </div>
  );
}
