"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeInternalPath(params.get("next"));
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sending, setSending] = useState(false);
  // Email+password accounts must verify before they can sign in; this holds the address to resend to / the inbox notice.
  const [unverified, setUnverified] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState<string | null>(null);
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

  async function resendVerification(email: string) {
    setSending(true);
    const res = await authClient.sendVerificationEmail({ email, callbackURL: mode === "sign-up" ? "/app/onboarding" : next });
    setSending(false);
    if (res.error) toast.error(res.error.message ?? "Could not send verification email");
    else toast.success("Verification email sent");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).trim();
    const password = String(fd.get("password"));
    const name = String(fd.get("name") ?? "").trim();
    setLoading(true);
    setUnverified(null);
    const res =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name, callbackURL: "/app/onboarding" })
        : await authClient.signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      if (res.error.code === "EMAIL_NOT_VERIFIED") setUnverified(email);
      else toast.error(res.error.message ?? "Something went wrong");
      return;
    }
    if (mode === "sign-up") {
      setSignedUp(email);
      return;
    }
    router.push(next);
    router.refresh();
  }

  if (signedUp) {
    return (
      <div className="space-y-4" data-testid="check-inbox">
        <div className="flex items-start gap-3 border border-line p-4">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-pink" />
          <div className="text-sm">
            <div className="font-medium">Check your inbox</div>
            <p className="mt-1 text-muted-foreground">We sent a verification link to <span className="font-mono text-foreground">{signedUp}</span>. Open it to activate your account — it signs you in and takes you to onboarding. The link is valid for 24 hours.</p>
          </div>
        </div>
        <Button type="button" variant="outline" className="h-11 w-full bg-background" disabled={sending} onClick={() => resendVerification(signedUp)}>
          {sending && <Loader2 className="size-4 animate-spin" />}
          Resend verification email
        </Button>
        <p className="text-center text-sm text-muted-foreground">Wrong address? <button type="button" className="text-foreground underline-offset-4 hover:underline" onClick={() => setSignedUp(null)}>Start over</button></p>
      </div>
    );
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
      {unverified && (
        <div className="space-y-3 border border-destructive/60 p-4 text-sm" role="alert" data-testid="unverified">
          <div className="font-medium">Verify your email to sign in</div>
          <p className="text-muted-foreground">Your account exists but <span className="font-mono text-foreground">{unverified}</span> has not been verified yet. Open the link we emailed you, or request a new one.</p>
          <Button type="button" variant="outline" size="sm" className="bg-background" disabled={sending} onClick={() => resendVerification(unverified)}>
            {sending && <Loader2 className="size-4 animate-spin" />}
            Resend verification email
          </Button>
        </div>
      )}
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
      {mode === "sign-in" ? (
        <p className="text-center text-sm text-muted-foreground"><Link className="underline-offset-4 hover:text-foreground hover:underline" href="/forgot-password">Forgot your password?</Link></p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">By creating an account you agree to the <Link className="text-foreground underline-offset-4 hover:underline" href="/terms">Terms</Link> and acknowledge the <Link className="text-foreground underline-offset-4 hover:underline" href="/privacy">Privacy Policy</Link>.</p>
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
