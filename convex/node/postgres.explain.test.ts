import { describe, expect, it } from "vitest";
import { explain } from "./postgres";

// Every pg error below carries the password in its message; mapped codes must replace it with guidance.
const err = (code: string, message = `connection to postgresql://ro:hunter2@db/app failed (${code})`) => Object.assign(new Error(message), { code });

describe("explain", () => {
  it.each([
    ["ENOTFOUND", /Host not found/, false],
    ["ECONNREFUSED", /Connection refused/, false],
    ["28P01", /Password authentication failed/, false],
    ["3D000", /Database does not exist/, false],
    ["42P01", /Table not found/, false],
    ["42501", /Permission denied/, false],
    ["57014", /Query timed out/, true],
    ["25006", /read-only SELECT/, false],
  ])("%s → guidance without echoing the message", (code, re, retryable) => {
    const out = explain(err(code));
    expect(out.message).toMatch(re);
    expect(out.message).not.toContain("hunter2");
    expect(out.retryable).toBe(retryable);
  });

  it("SSL text suggests the opposite mode", () => {
    expect(explain(new Error("The server does not support SSL connections"))).toEqual({ message: expect.stringContaining('switching SSL to "disable"'), retryable: false });
    expect(explain(new Error("self signed certificate in certificate chain")).message).toContain('switching SSL to "require"');
  });

  it("timeouts are retryable, unknown errors are sliced", () => {
    expect(explain(err("ETIMEDOUT"))).toMatchObject({ retryable: true });
    expect(explain(new Error("Connection terminated due to connection timeout"))).toMatchObject({ retryable: true });
    // Unmapped errors echo the driver message (bounded to 200 chars); the wrapper never receives a password here.
    expect(explain(new Error("x".repeat(300)))).toEqual({ message: "x".repeat(200), retryable: true });
    expect(explain(new Error('relation "foo" does not exist')).retryable).toBe(false);
    expect(explain("boom")).toEqual({ message: "boom", retryable: true });
  });
});
