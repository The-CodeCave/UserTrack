import { clerk } from "./clerk";
import { supabase } from "./supabase";
import { firebase } from "./firebase";
import { auth0 } from "./auth0";
import { posthog } from "./posthog";
import { plausible } from "./plausible";
import { ga4 } from "./ga4";
import { stripe } from "./stripe";
import { revenuecat } from "./revenuecat";
import { paddle } from "./paddle";
import { lemonsqueezy } from "./lemonsqueezy";
import { chargebee } from "./chargebee";
import { postgres } from "./postgres";
import { endpoint } from "./endpoint";
import { manual } from "./manual";
import type { Provider, ProviderKind, Role } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const providers: Record<ProviderKind, Provider<any>> = { clerk, supabase, firebase, auth0, posthog, plausible, ga4, stripe, revenuecat, paddle, lemonsqueezy, chargebee, postgres, endpoint, manual };

export function getProvider(kind: string) {
  const p = providers[kind as ProviderKind];
  if (!p) throw new Error(`Unknown provider: ${kind}`);
  return p;
}

export function providersForRole(role: Role) {
  return Object.values(providers).filter((p) => p.roles.includes(role));
}

export * from "./types";
