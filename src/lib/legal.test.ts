import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { EFFECTIVE_DATE, LEGAL_PAGES, OPERATOR, RETENTION_DAYS } from "./legal";

describe("legal constants", () => {
  it("operator data matches the CodeCave Impressum", () => {
    expect(OPERATOR.register).toBe("HRB 44492");
    expect(OPERATOR.vatId).toMatch(/^DE\d{9}$/);
    expect(OPERATOR.directors).toHaveLength(2);
    expect(OPERATOR.phoneHref.replace(/\D/g, "")).toBe(OPERATOR.phone.replace(/\D/g, ""));
  });

  it("effective date is an ISO day", () => {
    expect(EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(EFFECTIVE_DATE))).toBe(false);
  });

  it("retention periods are whole days", () => {
    for (const days of Object.values(RETENTION_DAYS)) expect(Number.isInteger(days) && days > 0).toBe(true);
    expect(RETENTION_DAYS.auditLogs).toBeGreaterThan(RETENTION_DAYS.apiUsage);
  });

  it("legal pages are clean top-level routes and /imprint redirects to /impressum", async () => {
    expect(LEGAL_PAGES.map((p) => p.href)).toEqual(["/impressum", "/privacy", "/terms"]);
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({ source: "/imprint", destination: "/impressum", permanent: true });
  });
});
