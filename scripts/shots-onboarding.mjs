// Screenshots of the reworked onboarding: avatar picker, website autofill, tech-stack dropdown, confetti finish.
// Usage: BASE=http://localhost:3210 node scripts/shots-onboarding.mjs
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:3210";
const out = "docs/screenshots/onboarding";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name, full = false) => { await p.waitForTimeout(600); await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log("✓", name); };
process.on("unhandledRejection", async (e) => { console.error(e); for (const p of ctx.pages()) await p.screenshot({ path: `/tmp/ob-fail-${ctx.pages().indexOf(p)}.png` }).catch(() => {}); process.exit(1); });

const tag = Date.now().toString(36);
const email = `onb-${tag}@example.com`;

const d = await page(1440);
await d.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
await d.fill("#name", "Ada Lovelace"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
await shot(d, "01-sign-up");
await d.click("button[type=submit]"); await d.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
execSync(`pnpm exec convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
await d.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
await d.fill("#email", email); await d.fill("#password", "supersecret123"); await d.click("button[type=submit]");
await d.waitForURL("**/app/onboarding", { timeout: 30000 });
await d.waitForSelector("#displayName", { timeout: 30000 });

// Step 1 — profile with the avatar picker. Type a handle and let the auto-pull run.
await shot(d, "02-profile-empty");
await d.fill("#username", `ada-${tag}`);
await d.fill("#x", "adalovelace");
await d.waitForTimeout(4000);
await shot(d, "03-profile-avatar-from-x");
for (const w of [375, 768]) { const p = await page(w); await p.goto(`${base}/app/onboarding`, { waitUntil: "networkidle" }); await p.waitForSelector("#displayName"); await shot(p, `03-profile-${w}`, true); await p.close(); }
await d.click("button[type=submit]");

// Step 2 — the SaaS form: paste a URL, autofill from the site.
await d.click("text=Connect manually", { timeout: 30000 });
await d.waitForSelector("#websiteUrl", { timeout: 30000 });
await shot(d, "04-saas-empty", true);
await d.fill("#websiteUrl", "https://vercel.com");
await d.click("[data-testid=site-autofill]");
await d.waitForTimeout(6000);
await shot(d, "05-saas-autofilled", true);

// Tech stack as a dropdown instead of a wall of chips.
await d.locator("[data-testid=stack-select] button[aria-haspopup=listbox]").scrollIntoViewIfNeeded();
await d.locator("[data-testid=stack-select] button[aria-haspopup=listbox]").click();
await shot(d, "06-stack-dropdown");
await d.fill("input[aria-label='Search Tech stack']", "next");
await shot(d, "07-stack-search");
await d.locator("[data-testid=stack-select] [role=option]").first().click();
await d.fill("input[aria-label='Search Tech stack']", "convex");
await d.locator("[data-testid=stack-select] [role=option]").first().click();
await d.keyboard.press("Escape");
await shot(d, "08-stack-selected");

// Finish the flow to reach the confetti screen.
if (!(await d.locator("#category option[value=analytics]").count())) throw new Error("category missing");
await d.selectOption("#category", "analytics");
await d.locator("form button[type=submit]").last().click();
await d.waitForSelector("text=What are you tracking?", { timeout: 30000 });
await d.locator("button", { hasText: /web/i }).first().click(); await d.click("button:has-text('Continue')"); await d.waitForTimeout(900);
for (let i = 0; i < 8 && !(await d.locator("text=Connect a data source").count()); i++) {
  const opt = d.locator("button[aria-pressed=false]");
  if (await opt.count()) { await opt.first().click(); await d.waitForTimeout(250); }
  await d.click("button:has-text('Continue'):enabled, button:has-text('Show recommendations'):enabled"); await d.waitForTimeout(800);
}
await d.waitForSelector("text=Connect a data source", { timeout: 30000 });
await d.click("text=Manual"); await d.fill("#totalUsers", "4321"); await d.click("button[type=submit]");
for (let i = 0; i < 6 && !(await d.locator("text=Publish page").count()); i++) {
  const skip = d.locator("text=Skip for now");
  if (await skip.count()) await skip.first().click();
  await d.waitForTimeout(800);
}
await d.click("text=Publish page");
await d.waitForSelector("text=on the board", { timeout: 30000 });
await d.waitForTimeout(450);
await shot(d, "09-confetti");

await browser.close();
console.log("done");
