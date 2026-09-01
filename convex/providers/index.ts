import { clerk } from "./clerk";
import { supabase } from "./supabase";
import { endpoint } from "./endpoint";
import { manual } from "./manual";
import type { Provider, ProviderKind } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const providers: Record<ProviderKind, Provider<any>> = { clerk, supabase, endpoint, manual };

export function getProvider(kind: string) {
  const p = providers[kind as ProviderKind];
  if (!p) throw new Error(`Unknown provider: ${kind}`);
  return p;
}

export * from "./types";
