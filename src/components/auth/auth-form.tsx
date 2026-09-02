"use client";

import { useEffect, useState, type FormEvent } from "react";
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const oauthError = params.get("error");

  useEffect(() => {
    if (oauthError) toast.error("Google sign-in failed. Please try again.");
  }, [oauthError]);

  async function signInWithGoogle() {
    setGoogleLoading(true);
    const res = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
      newUserCallbackURL: "/app/onboarding",
      errorCallbackURL: mode === "sign-up" ? "/sign-up" : "/sign-in",
    });
    if (res.error) {
      setGoogleLoading(false);
      toast.error(res.error.message ?? "Something went wrong");
    }
  }

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
      <Button type="button" variant="outline" className="h-11 w-full bg-background" disabled={googleLoading || loading} onClick={signInWithGoogle}>
        {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <div className="h-px flex-1 bg-line" />or<div className="h-px flex-1 bg-line" />
      </div>
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
      <Button type="submit" className="h-11 w-full" disabled={loading || googleLoading}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
      {mode === "sign-in" && (
        <p className="text-center text-sm text-muted-foreground"><Link className="underline-offset-4 hover:text-foreground hover:underline" href="/forgot-password">Forgot your password?</Link></p>
      )}
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

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}
