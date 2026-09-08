"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Script from "next/script";
import { authClient } from "@/lib/auth-client";
import { ANALYTICS_ENABLED, MASK_PATTERNS, RYBBIT_HOST, RYBBIT_SITE_ID, SKIP_PATTERNS, flushEvents, flushIdentity, identify, reset, track, type AuthMethod, type CtaLocation, type EventProps, type Events } from "@/lib/analytics";

// The tracker itself. SPA navigation, outbound links, web vitals, errors and autocapture are Rybbit site settings (docs/ANALYTICS.md).
export function AnalyticsScript() {
  if (!ANALYTICS_ENABLED) return null;
  return (
    <Script
      src={`${RYBBIT_HOST}/api/script.js`}
      strategy="afterInteractive"
      data-site-id={RYBBIT_SITE_ID}
      data-skip-patterns={JSON.stringify(SKIP_PATTERNS)}
      data-mask-patterns={JSON.stringify(MASK_PATTERNS)}
      onLoad={() => { flushIdentity(); flushEvents(); }}
    />
  );
}

// Links the session to the pseudonymous Better Auth user id (never an email) and clears it once signed out.
export function AnalyticsIdentity() {
  const { data, isPending } = authClient.useSession();
  const userId = data?.user.id ?? null;
  useEffect(() => {
    if (isPending) return;
    if (userId) identify(userId);
    else reset();
  }, [userId, isPending]);
  // OAuth sign-in completion: `withSignInMarker` (auth-form.tsx) tags the redirect target, fired here once a session actually exists.
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    const method = params.get("signedIn") as AuthMethod | null;
    if (!method) return;
    params.delete("signedIn");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    track("sign_in", { method });
  }, [userId]);
  return null;
}

export function CtaLink({ location, onClick, ...props }: React.ComponentProps<typeof Link> & { location: CtaLocation }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track("cta_click", { location });
        onClick?.(e);
      }}
    />
  );
}

// Typed event + props pair, so server components can hand tracking to a client element.
type Tracked = { [E in keyof Events]: { event: E; props: Events[E] } }[keyof Events];
const fire = (t: Tracked) => (track as (event: string, props?: EventProps) => void)(t.event, t.props as EventProps);

export function TrackedA({ event, props, onClick, ...rest }: React.ComponentProps<"a"> & Tracked) {
  return (
    <a
      {...rest}
      onClick={(e) => {
        fire({ event, props } as Tracked);
        onClick?.(e);
      }}
    />
  );
}

export function TrackOnMount(t: Tracked) {
  const ref = useRef(t);
  useEffect(() => fire(ref.current), []);
  return null;
}
