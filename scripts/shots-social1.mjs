// Usage: pnpm build && PORT=3005 pnpm start (port = dev SITE_URL), set X_CLIENT_ID/X_CLIENT_SECRET on the dev deployment, then node scripts/shots-social1.mjs
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
const base = "http://localhost:3005", out = "docs/screenshots/v1/SOCIAL-1";
const tag = Date.now().toString(36), email = `social1-${tag}@example.com`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name, full = false) => { await p.waitForTimeout(900); await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log("✓", name); };
process.on("unhandledRejection", async (e) => { console.error(e); for (const p of ctx.pages()) await p.screenshot({ path: `/tmp/ut-fail-${ctx.pages().indexOf(p)}.png` }).catch(() => {}); process.exit(1); });

const d = await page(1440);
await d.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
await d.fill("#name", "Shot Tester"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
await d.click("button[type=submit]"); await d.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
execSync(`npx convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
await d.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
await d.fill("#email", email); await d.fill("#password", "supersecret123"); await d.click("button[type=submit]");
await d.waitForURL("**/app/onboarding", { timeout: 30000 });
await d.waitForSelector("#displayName", { timeout: 30000 }); await d.fill("#username", `social1-${tag}`); await d.fill("#x", "shot_tester"); await d.click("button[type=submit]");
await d.click("text=Connect manually", { timeout: 30000 }); await d.waitForSelector("#name", { timeout: 30000 });
await d.fill("#name", "Shotly"); await d.fill("#websiteUrl", "https://shotly.example.com"); await d.fill("#description", "Screenshot fixture product for SOCIAL-1."); await d.selectOption("#category", "analytics");
await d.click("button[type=submit]"); await d.waitForSelector("text=What are you tracking?", { timeout: 30000 });
await d.locator("button", { hasText: /web/i }).first().click(); await d.click("button:has-text('Continue')"); await d.waitForTimeout(900);
for (let i = 0; i < 8 && !(await d.locator("text=Connect a data source").count()); i++) {
  const opt = d.locator("button[aria-pressed=false]");
  if (await opt.count()) { await opt.first().click(); await d.waitForTimeout(300); }
  await d.click("button:has-text('Continue'):enabled, button:has-text('Show recommendations'):enabled"); await d.waitForTimeout(900);
}
await d.waitForSelector("text=Connect a data source", { timeout: 30000 }); await d.click("text=Manual"); await d.fill("#totalUsers", "4321"); await d.click("button[type=submit]");
for (let i = 0; i < 6 && !(await d.locator("text=Publish page").count()); i++) {
  const skip = d.locator("text=Skip for now");
  if (await skip.count()) await skip.first().click();
  await d.waitForTimeout(900);
}
await d.click("text=Publish page"); await d.waitForSelector("text=on the board", { timeout: 30000 });

// Typed handle only → nudge
await d.goto(`${base}/app/settings/social`, { waitUntil: "networkidle" }); await d.waitForSelector("text=Connected X account", { timeout: 30000 }); await shot(d, "settings-typed-handle-nudge-1440", true);
// Fake connection with a follower count → count, refreshed-ago, Refresh now
const profile = JSON.parse(execSync(`npx convex run public:profileByUsername '{"username":"social1-${tag}"}'`, { encoding: "utf8" }));
execSync(`npx convex run social:storeConnection '${JSON.stringify({ profileId: profile._id, providerUserId: "1", handle: "shot_tester", name: "Shot Tester", accessToken: "fake-token", scopes: ["users.read"], followers: 12400 })}'`);
await d.reload({ waitUntil: "networkidle" }); await d.waitForSelector("text=Refresh now", { timeout: 30000 }); await shot(d, "settings-connected-followers-1440", true);
const ms = await page(375);
await ms.goto(`${base}/app/settings/social`, { waitUntil: "networkidle" }); await ms.waitForSelector("text=Refresh now", { timeout: 30000 }); await shot(ms, "settings-connected-followers-375", true);
await ms.goto(`${base}/u/social1-${tag}`, { waitUntil: "networkidle" }); await shot(ms, "profile-own-connected-375");
// Refresh now with a fake token → X answers 401 → connection flagged, error toast (unhappy path)
await d.click("text=Refresh now"); await d.waitForTimeout(4000); await shot(d, "settings-refresh-error-1440", true);
await browser.close(); console.log("DONE", email);
