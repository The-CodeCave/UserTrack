"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { SectionLabel } from "@/components/blueprint/section-label";
import { Panel } from "@/components/blueprint/panel";
import { Button } from "@/components/ui/button";
import { GitHubIcon, GoogleIcon, XIcon } from "@/components/auth/provider-icons";

const PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "github", label: "GitHub", Icon: GitHubIcon },
  { id: "twitter", label: "X", Icon: XIcon },
] as const;
type Provider = (typeof PROVIDERS)[number]["id"];
type Account = NonNullable<Awaited<ReturnType<typeof authClient.listAccounts>>["data"]>[number];

const LINK_ERRORS: Record<string, string> = {
  account_already_linked_to_different_user: "That account is already linked to another UserTrack user.",
  unable_to_link_account: "Could not link the account. Please try again.",
};

export function ConnectedAccountsPanel() {
  const enabled = useQuery(api.auth.providers);
  const params = useSearchParams();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    void authClient.listAccounts().then((res) => { if (!res.error) setAccounts(res.data); });
  }, [generation]);

  useEffect(() => {
    const linked = params.get("linked");
    const error = params.get("error");
    if (linked) toast.success(`${PROVIDERS.find((p) => p.id === linked)?.label ?? "Account"} connected`);
    else if (error) toast.error(LINK_ERRORS[error] ?? "Could not connect the account. Please try again.");
  }, [params]);

  async function link(provider: Provider) {
    setBusy(provider);
    const res = await authClient.linkSocial({ provider, callbackURL: `/app/settings?linked=${provider}`, errorCallbackURL: "/app/settings" });
    if (res.error) {
      setBusy(null);
      toast.error(res.error.message ?? "Could not connect the account");
    }
  }

  async function unlink(a: Account) {
    setBusy(a.providerId);
    const res = await authClient.unlinkAccount({ providerId: a.providerId, accountId: a.accountId });
    setBusy(null);
    if (res.error) toast.error(res.error.message ?? "Could not disconnect the account");
    else {
      toast.success("Account disconnected");
      setGeneration((g) => g + 1);
    }
  }

  const hasPassword = accounts?.some((a) => a.providerId === "credential") ?? false;
  const last = (accounts?.length ?? 0) <= 1;

  return (
    <Panel id="connected-accounts" className="space-y-4 p-5" data-testid="connected-accounts">
      <div>
        <SectionLabel>Connected accounts</SectionLabel>
        <p className="mt-2 text-sm text-muted-foreground">Sign-in methods for this account. Connecting X here is for signing in only — posting from your X account is set up under <Link href="/app/settings/social" className="underline underline-offset-4 hover:text-foreground">Social &amp; X</Link>.</p>
      </div>
      <ul className="divide-y divide-line border border-line">
        {PROVIDERS.map(({ id, label, Icon }) => {
          const account = accounts?.find((a) => a.providerId === id);
          const available = enabled?.[id] !== false;
          return (
            <li key={id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <Icon />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {accounts === null ? "…" : account ? `Connected · ${new Date(account.createdAt).toLocaleDateString()}` : available ? "Not connected" : "Not enabled on this deployment"}
                </div>
              </div>
              {account ? (
                <Button variant="outline" size="sm" className="bg-background" disabled={busy !== null || last} title={last ? "Add another sign-in method or a password first" : undefined} onClick={() => unlink(account)}>
                  {busy === id && <Loader2 className="size-4 animate-spin" />}
                  Disconnect
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="bg-background" disabled={busy !== null || accounts === null || !available} onClick={() => link(id)}>
                  {busy === id && <Loader2 className="size-4 animate-spin" />}
                  Connect
                </Button>
              )}
            </li>
          );
        })}
        <li className="flex flex-wrap items-center gap-3 px-3 py-3">
          <span className="w-4 text-center font-mono text-xs text-muted-foreground">••</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Email &amp; password</div>
            <div className="font-mono text-[11px] text-muted-foreground">{accounts === null ? "…" : hasPassword ? "Set" : "Not set — use “Forgot your password?” on the sign-in page to add one"}</div>
          </div>
        </li>
      </ul>
      {last && accounts !== null && <p className="text-xs text-muted-foreground">Your only sign-in method cannot be disconnected.</p>}
    </Panel>
  );
}
