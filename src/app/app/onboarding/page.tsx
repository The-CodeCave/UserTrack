"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { track as analytics, type AuthMethod } from "@/lib/analytics";
import { readAttribution } from "@/lib/attribution";
import { Logo } from "@/components/site/logo";
import { HelpCallout } from "@/components/site/feedback";
import { Panel } from "@/components/blueprint/panel";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileForm } from "@/components/app/profile-form";
import { AddSaas } from "@/components/app/add-saas";
import { AiDone, type AiSetupProject } from "@/components/app/ai-setup";
import { profileUrl } from "@/lib/site";

const SOCIAL_METHODS: readonly AuthMethod[] = ["google", "github", "x"];

// First run. The product is added exactly the way it is added from the dashboard — the only thing this page adds is
// the founder's own handle, asked once the product already exists and reports numbers.
export default function OnboardingPage() {
  const router = useRouter();
  const me = useQuery(api.profiles.me);
  const mine = useQuery(api.saas.listMine);
  const [project, setProject] = useState<AiSetupProject | null>(null);
  const [done, setDone] = useState(false);
  const ensure = useMutation(api.profiles.ensure);
  const complete = useMutation(api.profiles.completeOnboarding);
  const skip = useMutation(api.profiles.skipOnboarding);
  const first = mine?.[0];

  useEffect(() => {
    if (me?.profile?.onboardingCompleted && !project) router.replace("/app");
  }, [me, project, router]);

  // saas.ownerId needs a profile row before the founder has picked a handle; it stays unconfirmed until the profile step.
  useEffect(() => {
    if (me && !me.profile) void ensure().catch((err: Error) => toast.error(err.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]));
  }, [me, ensure]);

  // Social sign-ups only complete once the OAuth redirect lands here; `?new=` carries the provider.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("new") as AuthMethod | null;
    if (!m) return;
    window.history.replaceState(null, "", "/app/onboarding");
    if (SOCIAL_METHODS.includes(m)) analytics("sign_up_completed", { method: m, ref: readAttribution()?.ref });
  }, []);

  async function finish() {
    setDone(true);
    await complete();
    analytics("onboarding_completed");
    toast.success("You're live!");
  }

  // Leaving mid-setup must not trap the founder behind the onboarding redirect on their next visit.
  async function leave() {
    await skip();
    analytics("onboarding_skipped", { hasProduct: first ? "yes" : "no" });
    router.replace(first ? `/app/saas/${first._id}` : "/app");
  }

  if (me === undefined || mine === undefined) {
    return <div className="mx-auto max-w-xl p-6"><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-72 w-full" /></div>;
  }

  return (
    <main className="relative min-h-full flex-1 px-4 py-8 sm:py-14">
      <div aria-hidden className="bp-grid bp-grid-fade absolute inset-0 -z-10" />
      <div className="mx-auto max-w-xl">
        <Link href="/" className="mb-8 inline-block"><Logo /></Link>

        {done && project ? (
          <AiDone project={project} />
        ) : project && me?.profile ? (
          <Panel className="p-6">
            <SectionLabel>Last step</SectionLabel>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Name your founder page</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
              Everything you track lands on <span className="font-mono text-foreground">{profileUrl(me.profile.username)}</span> — we picked that handle from your name, change it below if you want another one. Your X handle is optional and never posted to without your say-so.
            </p>
            <ProfileForm compact initial={me.profile} submitLabel="Finish" onSaved={finish} />
          </Panel>
        ) : (
          <>
            <AddSaas extraSteps={["Profile"]} resume={first ? { saasId: first._id, name: first.name, websiteUrl: first.websiteUrl } : null} onDone={setProject} />
            <button type="button" onClick={leave} className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {first ? "Finish this later — take me to the dashboard" : "Skip for now — I just want to look around"}
            </button>
          </>
        )}

        <HelpCallout surface="onboarding" className="mt-6" title="Stuck on this step?">
          Onboarding is where most things break. If a provider will not connect, a number looks wrong or a step makes no sense — write it here and it lands in my inbox with the step you are on. I am one founder, I read all of it and usually reply the same day.
        </HelpCallout>
      </div>
    </main>
  );
}
