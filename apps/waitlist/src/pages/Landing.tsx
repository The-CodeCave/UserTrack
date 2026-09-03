import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Link } from "../Link";
import { Footer } from "../Shell";

declare global {
  interface Window { rybbit?: { event: (name: string, props?: Record<string, unknown>) => void } }
}

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; already: boolean } | { kind: "error"; message: string };

function context() {
  const params = new URLSearchParams(window.location.search);
  let referrer: string | undefined;
  try { referrer = document.referrer ? new URL(document.referrer).hostname : undefined; } catch { /* ignore */ }
  const device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? ("mobile" as const) : ("desktop" as const);
  return { source: params.get("utm_source") ?? undefined, referrer, device };
}

const TEASERS = [
  { n: "01", title: "Leaderboards & trending", text: "Ranked by verified growth, not size — a 2-week-old product can beat a stalled 50k one." },
  { n: "02", title: "A public growth page for every product", text: "Shareable history chart, milestones and an embeddable badge." },
  { n: "03", title: "Free datasets, API & MCP server", text: "JSON/CSV dumps, a public API and an MCP server so agents can query growth too." },
];

export default function Landing() {
  const join = useMutation(api.waitlist.join);
  const count = useQuery(api.waitlist.count);
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.kind === "busy") return;
    setState({ kind: "busy" });
    try {
      const res = await join({ email, hp: hp || undefined, ...context() });
      if (!res.ok) {
        setState({ kind: "error", message: res.error });
        window.rybbit?.event("waitlist_join_failed", { reason: "invalid" });
        return;
      }
      setState({ kind: "done", already: res.already });
      window.rybbit?.event("waitlist_join", { already: res.already });
    } catch {
      setState({ kind: "error", message: "Something went wrong. Please try again in a moment." });
      window.rybbit?.event("waitlist_join_failed", { reason: "network" });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="relative flex-1 overflow-hidden">
        <div aria-hidden className="bp-grid absolute inset-0 -z-10" />
        <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 sm:pt-24">
          <img src="/brand/wordmark.png" alt="UserTrack" width={2172} height={724} className="h-9 w-auto sm:h-11" />
          <div className="text-label mt-10">The growth data layer for SaaS &amp; apps · coming soon</div>
          <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            See which SaaS are <span className="text-pink">actually</span> growing.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Verified user growth pulled read-only from Clerk, Supabase, Stripe &amp; co — never typed in, never revenue. Discover what is growing, follow it, build on the history.
          </p>

          <div className="mt-10 max-w-xl">
            {state.kind === "done" ? (
              <div role="status" className="border border-pink/60 bg-card p-5 pink-glow">
                <div className="font-bold">{state.already ? "You're already on the list." : "You're on the list."}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {state.already ? "No need to sign up twice — we'll email you once at launch." : "We'll email you once at launch. No newsletter, no spam."}
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row">
                <label htmlFor="email" className="sr-only">Email address</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (state.kind === "error") setState({ kind: "idle" }); }}
                  aria-invalid={state.kind === "error"}
                  aria-describedby="consent"
                  className="h-12 sm:flex-1 border border-line-strong bg-card px-4 text-base outline-none placeholder:text-muted-foreground/70 focus:border-pink focus:ring-2 focus:ring-pink/30 aria-invalid:border-destructive"
                />
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
                <button
                  type="submit"
                  disabled={state.kind === "busy"}
                  className="h-12 bg-pink px-6 font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {state.kind === "busy" ? "Joining…" : "Join the waitlist"}
                </button>
              </form>
            )}
            {state.kind === "error" && (
              <p role="alert" className="mt-3 text-sm text-destructive">{state.message}</p>
            )}
            {state.kind !== "done" && (
              <p id="consent" className="mt-3 text-xs text-muted-foreground">
                By joining you agree to receive one launch email. See our <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
              </p>
            )}
            {typeof count === "number" && count >= 25 && (
              <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{count.toLocaleString("en-US")} founders already waiting</p>
            )}
          </div>

          <div className="mt-16 grid gap-3 sm:grid-cols-3">
            {TEASERS.map((t) => (
              <div key={t.n} className="border border-line bg-card/80 p-5">
                <div className="font-mono text-[11px] text-muted-foreground">{t.n}</div>
                <div className="mt-3 font-bold">{t.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
