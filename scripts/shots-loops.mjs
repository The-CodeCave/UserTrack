import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
// LOOPS-1 screenshots (streak chip, dashboard watchlist + unseen state, badge snippet). Usage: pnpm build && PORT=3100 pnpm start,
// then BASE=http://localhost:3100 node scripts/shots-loops.mjs. The dev deployment's SITE_URL must match the port (Better Auth).
// Fixture data (streak fields, follows) is seeded by a dev-only `qaLoops:prepare` mutation that is not part of the repo.
// FIX-4 limits /sign-up to 10 per hour: reuse an onboarded account with ACCOUNT=<email> (password is always supersecret123).
const base = process.env.BASE ?? "http://localhost:3100", out = "docs/screenshots/v1/loops";
const WIDTHS = [1440, 375];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name, full = true) => { await p.waitForTimeout(1600); await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log("✓", name); };
process.on("unhandledRejection", async (e) => { console.error(e); process.exit(1); });

const reuse = process.env.ACCOUNT;
const tag = `loops-${Date.now().toString(36)}`, email = reuse ?? `${tag}@example.com`;
const d = await page(1440);
if (!reuse) {
  // Land through an attributed link so the first-touch attribution path is exercised end to end.
  await d.goto(`${base}/sign-up?ref=badge&utm_source=badge&utm_medium=image&utm_campaign=users`, { waitUntil: "domcontentloaded" });
  await d.fill("#name", "Loops Founder"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
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
  await d.fill("#name", `Loops ${tag}`); await d.fill("#websiteUrl", "https://loops.example.com"); await d.fill("#description", "LOOPS-1 screenshot fixture product."); await d.selectOption("#category", "developer-tools");
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
const username = reuse ? process.env.USERNAME_TAG : tag;
const raw = execSync(`npx convex run qaLoops:prepare '${JSON.stringify({ username })}'`, { encoding: "utf8" });
const fixture = JSON.parse(raw.slice(raw.indexOf("{")));
console.log("fixture", fixture);
// Safety net only: the bounce to /sign-in was the shared `no-trusted-ip` token bucket in the proxy guard (fixed in src/proxy.ts).
for (let i = 0; i < 3 && !(await d.locator("text=From your watchlist").count()); i++) { await d.goto(`${base}/app`, { waitUntil: "domcontentloaded" }); await d.waitForTimeout(5000); }
const manageHref = await d.locator('a[href^="/app/saas/j"]').first().getAttribute("href");
await d.close();

const SHOTS = [
  ["dashboard", "/app", "text=From your watchlist"],
  ["manage", manageHref, "text=streak"],
  ["manage-header", manageHref, "text=streak", null, false],
  ["public", `/s/${fixture.slug}`, "text=streak"],
  ["badge-snippet", `${manageHref}/embed`, "text=SVG badge", async (p) => { await p.click("button:has-text('SVG badge')"); await p.waitForSelector("text=Markdown"); }],
  ["following", "/app/following", "text=intelligence feed"],
  ["dashboard-seen", "/app", "text=From your watchlist"],
];
// ONLY=dashboard-seen,manage-header re-captures single shots.
const only = process.env.ONLY?.split(",");
for (const w of WIDTHS) {
  const p = await page(w);
  for (const [name, path, wait, prep, full] of SHOTS.filter((s) => !only || only.includes(s[0]))) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await p.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      if (await p.waitForSelector(wait, { timeout: 30000 }).then(() => true, () => false)) break;
      console.warn("!", name, w, "retrying —", p.url());
    }
    if (prep) await prep(p);
    await shot(p, `${name}-${w}`, full !== false);
  }
  await p.close();
}
await browser.close(); console.log("DONE", email, username);
