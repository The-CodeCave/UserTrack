import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
// Usage: PORT=3005 pnpm start (port = dev SITE_URL), then node scripts/shots-auth1.mjs [public|signed-in]
const base = process.env.BASE ?? "http://localhost:3005", out = "docs/screenshots/v1/AUTH-1";
const phase = process.argv[2] ?? "public";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name, full = false) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log("✓", name); };

if (phase === "public") {
  for (const w of [375, 768, 1440]) {
    const p = await page(w);
    await p.goto(`${base}/sign-in`, { waitUntil: "networkidle" }); await shot(p, `sign-in-${w}`, w === 375);
    if (w === 1440) { await p.goto(`${base}/sign-up`, { waitUntil: "networkidle" }); await shot(p, "sign-up-1440"); }
    await p.close();
  }
  const e = await page(1440);
  await e.goto(`${base}/sign-in?error=email_not_found`, { waitUntil: "networkidle" }); await shot(e, "sign-in-x-no-email-1440");
  await e.close();
}

if (phase === "signed-in") {
  // Throwaway password account, verified through the token in the Better Auth component (no mail in dev).
  const tag = Date.now().toString(36), email = `auth1-${tag}@example.com`;
  const d = await page(1440);
  await d.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
  await d.fill("#name", "Auth Shot"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
  await d.click("button[type=submit]"); await d.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
  // The verification token is a signed JWT that only reaches the inbox; flip the flag through the component adapter instead.
  const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
  execSync(`npx convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
  await d.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await d.fill("#email", email); await d.fill("#password", "supersecret123"); await d.click("button[type=submit]");
  await d.waitForURL("**/app/onboarding", { timeout: 30000 });
  // Minimal onboarding (profile → manual product → first answer of every stack question → manual source → publish) so the app shell lets us into Settings.
  await d.waitForSelector("#displayName", { timeout: 30000 }); await d.fill("#username", `auth1-${tag}`); await d.click("button[type=submit]");
  await d.click("text=Connect manually", { timeout: 30000 }); await d.waitForSelector("#name", { timeout: 30000 });
  await d.fill("#name", `Auth SaaS ${tag}`); await d.fill("#websiteUrl", "https://auth1.example.com"); await d.fill("#description", "Screenshot fixture product."); await d.selectOption("#category", "developer-tools");
  await d.click("button[type=submit]"); await d.waitForSelector("text=What are you tracking?", { timeout: 30000 });
  await d.locator("button", { hasText: /web/i }).first().click(); await d.click("button:has-text('Continue')"); await d.waitForTimeout(900);
  for (let i = 0; i < 8 && !(await d.locator("text=Connect a data source").count()); i++) {
    const opt = d.locator("button[aria-pressed=false]");
    if (await opt.count()) { await opt.first().click(); await d.waitForTimeout(300); }
    await d.click("button:has-text('Continue'):enabled, button:has-text('Show recommendations'):enabled"); await d.waitForTimeout(900);
  }
  await d.waitForSelector("text=Connect a data source", { timeout: 30000 }); await d.click("text=Manual"); await d.fill("#totalUsers", "1234"); await d.click("button[type=submit]");
  for (let i = 0; i < 6 && !(await d.locator("text=Publish page").count()); i++) {
    const skip = d.locator("text=Skip for now");
    if (await skip.count()) await skip.first().click();
    await d.waitForTimeout(900);
  }
  await d.click("text=Publish page"); await d.waitForSelector("text=on the board", { timeout: 30000 });
  for (const w of [375, 768, 1440]) {
    const p = await page(w);
    await p.goto(`${base}/app/settings`, { waitUntil: "networkidle" });
    await p.waitForSelector("[data-testid=connected-accounts]", { timeout: 30000 });
    await p.locator("[data-testid=connected-accounts]").scrollIntoViewIfNeeded();
    await shot(p, `settings-connected-accounts-${w}`, w === 375);
    await p.locator("[data-testid=connected-accounts]").screenshot({ path: `${out}/connected-accounts-panel-${w}.png` });
    await p.close();
  }
  const l = await page(1440);
  await l.goto(`${base}/app/settings?error=account_already_linked_to_different_user`, { waitUntil: "networkidle" });
  await l.waitForSelector("[data-testid=connected-accounts]", { timeout: 30000 }); await shot(l, "settings-link-error-1440");
  await l.close();
  console.log("DONE", email);
}
await browser.close();
