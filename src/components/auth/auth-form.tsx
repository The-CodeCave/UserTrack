"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { api } from "@convex/_generated/api";
import { track, type AuthMethod } from "@/lib/analytics";
import { readAttribution } from "@/lib/attribution";
import { authClient } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitHubIcon, GoogleIcon, XIcon } from "@/components/auth/provider-icons";

const SOCIAL = [
  { id: "google", label: "Google", method: "google", Icon: GoogleIcon },
  { id: "github", label: "GitHub", method: "github", Icon: GitHubIcon },
  { id: "twitter", label: "X", method: "x", Icon: XIcon },
] as const satisfies ReadonlyArray<{ id: string; label: string; method: AuthMethod; Icon: () => React.JSX.Element }>;
type Social = (typeof SOCIAL)[number]["id"];

const OAUTH_ERRORS: Record<string, string> = {
  email_not_found: "X did not share an email address with UserTrack. Sign in with Google, GitHub or email first, then connect X under Settings → Connected accounts.",
  account_already_linked_to_different_user: "That account is already linked to another UserTrack user.",
};

function withSignInMarker(path: string, method: AuthMethod) {
  const url = new URL(path, "http://x.invalid");
  url.searchParams.set("signedIn", method);
  return url.pathname + url.search + url.hash;
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeInternalPath(params.get("next"));
  const [loading, setLoading] = useState(false);
  const [social, setSocial] = useState<Social | null>(null);
  const providers = useQuery(api.auth.providers);
  const [sending, setSending] = useState(false);
  // Email+password accounts must verify before they can sign in; this holds the address to resend to / the inbox notice.
  const [unverified, setUnverified] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState<string | null>(null);
  const oauthError = params.get("error");

  useEffect(() => {
    if (oauthError) toast.error(OAUTH_ERRORS[oauthError] ?? "Social sign-in failed. Please try again.", { duration: 8000 });
  }, [oauthError]);

  async function signInWith({ id, method }: (typeof SOCIAL)[number]) {
    setSocial(id);
    // Sign-in fires once the redirect actually lands (AnalyticsIdentity), not on click — an abandoned OAuth popup is not a sign-in.
    if (mode === "sign-up") track("sign_up_started", { method });
    const res = await authClient.signIn.social({
      provider: id,
      callbackURL: mode === "sign-in" ? withSignInMarker(next, method) : next,
      newUserCallbackURL: `/app/onboarding?new=${method}`,
      errorCallbackURL: mode === "sign-up" ? "/sign-up" : "/sign-in",
    });
    if (res.error) {
      setSocial(null);
      toast.error(res.error.message ?? "Something went wrong");
    }
  }

  async function resendVerification(email: string) {
    setSending(true);
    const res = await authClient.sendVerificationEmail({ email, callbackURL: mode === "sign-up" ? "/app/onboarding" : next });
    setSending(false);
    if (res.error) toast.error(res.error.message ?? "Could not send verification email");
    else {
      track("email_verification_resent");
      toast.success("Verification email sent");
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).trim();
    const password = String(fd.get("password"));
    const name = String(fd.get("name") ?? "").trim();
    setLoading(true);
    setUnverified(null);
    if (mode === "sign-up") track("sign_up_started", { method: "email" });
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
      track("sign_up_completed", { method: "email", ref: readAttribution()?.ref });
      setSignedUp(email);
      return;
    }
    track("sign_in", { method: "email" });
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
      {SOCIAL.map((p) => {
        const available = providers?.[p.id] !== false;
        return (
          <Button key={p.id} type="button" variant="outline" className="h-11 w-full bg-background" disabled={social !== null || loading || !available} title={available ? undefined : `${p.label} sign-in is not enabled on this deployment`} onClick={() => signInWith(p)}>
            {social === p.id ? <Loader2 className="size-4 animate-spin" /> : <p.Icon />}
            Continue with {p.label}
          </Button>
        );
      })}
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
      <Button type="submit" className="h-11 w-full" disabled={loading || social !== null}>
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

