// The only place that talks to Resend. Everything else goes through `send.ts`.

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  idempotencyKey?: string;
}

export interface EmailConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export const DEFAULT_FROM = "UserTrack <noreply@mail.usertrack.dev>";
export const DEFAULT_REPLY_TO = "hello@usertrack.dev";

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { apiKey, from: env.EMAIL_FROM || DEFAULT_FROM, replyTo: env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO };
}

export class ResendError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
  }
}

export async function sendViaResend(cfg: EmailConfig, mail: OutboundEmail, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      ...(mail.idempotencyKey ? { "Idempotency-Key": mail.idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [mail.to],
      reply_to: cfg.replyTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
      tags: mail.tags,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    throw new ResendError(`Resend ${res.status}: ${body.slice(0, 200)}`, res.status, retryable);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new ResendError("Resend returned no message id", 502, true);
  return { id: json.id };
}
