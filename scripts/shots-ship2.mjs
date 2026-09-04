import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
// SHIP-2 consolidation pass. Usage: pnpm build && PORT=3100 pnpm start, then BASE=http://localhost:3100 node scripts/shots-ship2.mjs
// The dev deployment's SITE_URL must match that port (`npx convex env set SITE_URL http://localhost:3100`) or Better Auth answers 403 (A208).
const base = process.env.BASE ?? "http://localhost:3100", out = "docs/screenshots/v1/ship2";
const WIDTHS = [375, 768, 1440];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name) => { await p.waitForTimeout(1600); await p.screenshot({ path: `${out}/${name}.png`, fullPage: true }); console.log("✓", name); };
process.on("unhandledRejection", async (e) => { console.error(e); process.exit(1); });

const PUBLIC = [["landing", "/"], ["leaderboard", "/leaderboard"], ["project-demo", "/s/demo-northwind"]];
for (const w of WIDTHS) {
  const p = await page(w);
  for (const [name, path] of PUBLIC) { await p.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 }); await shot(p, `${name}-${w}`); }
  await p.close();
}

// FIX-4 limits /sign-up/* to 10 per hour, so a re-run inside the hour reuses an already-onboarded
// account instead: ACCOUNT=<email> node scripts/shots-ship2.mjs (password is always supersecret123).
const reuse = process.env.ACCOUNT;
const tag = `ship2-${Date.now().toString(36)}`, email = reuse ?? `${tag}@example.com`;
const d = await page(1440);
if (!reuse) {
  await d.goto(`${base}/sign-up`, { waitUntil: "domcontentloaded" });
  await d.fill("#name", "Ship2 Founder"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
  await d.click("button[type=submit]"); await d.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
  const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
  execSync(`npx convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
}
await d.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded" });
await d.fill("#email", email); await d.fill("#password", "supersecret123"); await d.click("button[type=submit]");
await d.waitForURL(reuse ? "**/app**" : "**/app/onboarding", { timeout: 30000 });
if (!reuse) {
await d.waitForSelector("#displayName", { timeout: 30000 });
await d.fill("#username", tag); await d.click("button[type=submit]");
await d.click("text=Connect manually", { timeout: 30000 }); await d.waitForSelector("#name", { timeout: 30000 });
await d.fill("#name", `Ship2 ${tag}`); await d.fill("#websiteUrl", "https://ship2.example.com"); await d.fill("#description", "SHIP-2 verification fixture product."); await d.selectOption("#category", "developer-tools");
await d.click("button[type=submit]"); await d.waitForSelector("text=What are you tracking?", { timeout: 30000 });
await d.locator("button", { hasText: /web/i }).first().click(); await d.click("button:has-text('Continue')"); await d.waitForTimeout(900);
for (let i = 0; i < 8 && !(await d.locator("text=Connect a data source").count()); i++) {
  const opt = d.locator("button[aria-pressed=false]");
  if (await opt.count()) { await opt.first().click(); await d.waitForTimeout(300); }
  await d.click("button:has-text('Continue'):enabled, button:has-text('Show recommendations'):enabled"); await d.waitForTimeout(900);
}
await d.waitForSelector("text=Connect a data source", { timeout: 30000 }); await d.click("text=Manual"); await d.fill("#totalUsers", "8420"); await d.click("button[type=submit]");
for (let i = 0; i < 6 && !(await d.locator("text=Publish page").count()); i++) {
  const skip = d.locator("text=Skip for now");
  if (await skip.count()) await skip.first().click();
  await d.waitForTimeout(900);
}
await d.click("text=Publish page"); await d.waitForSelector("text=on the board", { timeout: 30000 });
}
const cookies = await ctx.cookies();
await d.close();

for (const w of WIDTHS) {
  const p = await page(w);
  await p.context().addCookies(cookies);
  await p.goto(`${base}/app/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForSelector("text=Email notifications", { timeout: 30000 });
  await shot(p, `settings-${w}`);
  await p.close();
}
await browser.close(); console.log("DONE", email);
