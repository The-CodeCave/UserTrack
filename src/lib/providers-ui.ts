export type ProviderKind = "clerk" | "supabase" | "endpoint" | "manual";

export interface ProviderField {
  name: string;
  label: string;
  placeholder: string;
  type?: "text" | "password" | "number" | "url";
  optional?: boolean;
}

export interface ProviderMeta {
  kind: ProviderKind;
  label: string;
  tagline: string;
  trust: "verified" | "conditional" | "unverified";
  fields: ProviderField[];
  help: string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    kind: "clerk",
    label: "Clerk",
    tagline: "Read-only user count via the Clerk API",
    trust: "verified",
    fields: [{ name: "secretKey", label: "Secret key", placeholder: "sk_live_…", type: "password" }],
    help: "Clerk Dashboard → API Keys → Secret keys. We only call GET /v1/users/count.",
  },
  {
    kind: "supabase",
    label: "Supabase",
    tagline: "Counts auth users (or any table) via the service role",
    trust: "verified",
    fields: [
      { name: "url", label: "Project URL", placeholder: "https://xxxx.supabase.co", type: "url" },
      { name: "serviceKey", label: "Service role key", placeholder: "eyJhbGciOi…", type: "password" },
      { name: "table", label: "Table (optional)", placeholder: "Leave empty to count auth.users", optional: true },
    ],
    help: "Project Settings → API. The key is stored server-side and never exposed.",
  },
  {
    kind: "endpoint",
    label: "JSON endpoint",
    tagline: "Your own URL returning { \"totalUsers\": 1234 }",
    trust: "conditional",
    fields: [
      { name: "url", label: "Endpoint URL", placeholder: "https://api.yourapp.com/usertrack", type: "url" },
      { name: "token", label: "Bearer token (optional)", placeholder: "Sent as Authorization: Bearer …", type: "password", optional: true },
    ],
    help: "Verified when the endpoint is on the same domain as your SaaS website. Otherwise labelled self-reported.",
  },
  {
    kind: "manual",
    label: "Manual",
    tagline: "Type a number. Always labelled self-reported, never ranked.",
    trust: "unverified",
    fields: [{ name: "totalUsers", label: "Total users", placeholder: "1200", type: "number" }],
    help: "Good for a quick start. Connect a real source later to get verified and ranked.",
  },
];
