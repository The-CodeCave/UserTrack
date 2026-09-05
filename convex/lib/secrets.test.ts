import { beforeAll, describe, expect, it } from "vitest";
import { providers } from "../providers";
import { decryptConfig, decryptValue, encryptConfig, encryptValue, isEncrypted, SECRET_FIELDS } from "./secrets";

beforeAll(() => {
  process.env.CONFIG_ENCRYPTION_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
});

describe("credential encryption", () => {
  it("round-trips a value and never stores it in the clear", async () => {
    const secret = "sb_service_role_abcdefghijklmnop";
    const ct = await encryptValue(secret);
    expect(isEncrypted(ct)).toBe(true);
    expect(ct).not.toContain(secret);
    expect(await decryptValue(ct)).toBe(secret);
  });

  it("uses a fresh IV per call", async () => {
    expect(await encryptValue("same")).not.toBe(await encryptValue("same"));
  });

  it("encrypts only the credential fields of a config", async () => {
    const plain = { mode: "api", url: "https://x.supabase.co", serviceKey: "service-role-key", table: "profiles" };
    const stored = (await encryptConfig("supabase", plain)) as typeof plain;
    expect(stored.serviceKey).not.toBe(plain.serviceKey);
    expect(isEncrypted(stored.serviceKey)).toBe(true);
    expect({ ...stored, serviceKey: "" }).toEqual({ ...plain, serviceKey: "" });
    expect(await decryptConfig("supabase", stored)).toEqual(plain);
  });

  it("is idempotent and passes plaintext rows through", async () => {
    const stored = await encryptConfig("clerk", { secretKey: "sk_live_1" });
    expect(await encryptConfig("clerk", stored)).toEqual(stored);
    expect(await decryptConfig("clerk", { secretKey: "sk_live_1" })).toEqual({ secretKey: "sk_live_1" });
  });

  it("maps the legacy better_auth kind onto native", async () => {
    const stored = (await encryptConfig("better_auth", { url: "https://x.dev", secret: "s3cret" })) as { secret: string };
    expect(isEncrypted(stored.secret)).toBe(true);
  });

  it("declares secret fields for every provider kind", () => {
    for (const kind of Object.keys(providers)) expect(SECRET_FIELDS[kind as keyof typeof SECRET_FIELDS], kind).toBeDefined();
  });

  it("refuses to store a credential without a key", async () => {
    const key = process.env.CONFIG_ENCRYPTION_KEY;
    delete process.env.CONFIG_ENCRYPTION_KEY;
    await expect(encryptValue("x")).rejects.toThrow("CONFIG_ENCRYPTION_KEY");
    process.env.CONFIG_ENCRYPTION_KEY = key;
  });
});
