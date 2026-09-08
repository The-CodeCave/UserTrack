// Screenshots of the reordered wizard: Your SaaS → Platform → Stack → Source → … → Profile → Publish (A234).
// Usage: BASE=http://localhost:3100 node scripts/shots-profile-last.mjs
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:3100";
const out = "docs/screenshots/v1/profile-last";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name, full = false) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log("✓", name); };
process.on("unhandledRejection", async (e) => { console.error(e); let i = 0; for (const p of ctx.pages()) await p.screenshot({ path: `/tmp/pl-fail-${i++}.png` }).catch(() => {}); process.exit(1); });

const tag = Date.now().toString(36);
const email = `pl-${tag}@example.com`;

const d = await page(1440);
await d.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
await d.fill("#name", "Ada Lovelace"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
await d.click("button[type=submit]"); await d.waitForSelector("[data-testid=check-inbox]", { timeout: 60000 });
const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
execSync(`pnpm exec convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
await d.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
await d.fill("#email", email); await d.fill("#password", "supersecret123"); await d.click("button[type=submit]");
await d.waitForURL("**/app/onboarding", { timeout: 60000 });

// Step 1 is now "Your SaaS" — no profile form in sight.
await d.waitForSelector("text=Add your SaaS", { timeout: 60000 });
await shot(d, "01-step1-your-saas", true);
for (const w of [375, 768]) { const p = await page(w); await p.goto(`${base}/app/onboarding`, { waitUntil: "networkidle" }); await p.waitForSelector("text=Add your SaaS"); await shot(p, `01-step1-your-saas-${w}`, true); await p.close(); }

// The placeholder profile already exists, but it resolves nowhere public.
const ghost = await d.evaluate(async (u) => (await fetch(u)).status, `${base}/api/v1/users/ada-lovelace`);
console.log("placeholder /api/v1/users/ada-lovelace →", ghost);

await d.click("text=Connect manually");
await d.waitForSelector("#websiteUrl", { timeout: 60000 });
await d.fill("#name", `Northlight ${tag}`);
await d.fill("#description", "Uptime and status pages for indie SaaS teams.");
await d.fill("#websiteUrl", `https://northlight-${tag}.example.com`);
if (await d.locator("#category option[value=analytics]").count()) await d.selectOption("#category", "analytics");
await d.locator("form button[type=submit]").last().click();

// Step 2 — platform.
await d.waitForSelector("text=What are you tracking?", { timeout: 60000 });
await shot(d, "02-step2-platform", true);
await d.locator("button", { hasText: /web/i }).first().click();
await d.click("button:has-text('Continue')"); await d.waitForTimeout(900);

// Step 3 — stack questions.
for (let i = 0; i < 8 && !(await d.locator("text=Connect a data source").count()); i++) {
  if (i === 0) await shot(d, "03-step3-stack", true);
  const opt = d.locator("button[aria-pressed=false]");
  if (await opt.count()) { await opt.first().click(); await d.waitForTimeout(250); }
  await d.click("button:has-text('Continue'):enabled, button:has-text('Show recommendations'):enabled"); await d.waitForTimeout(800);
}

// Step 4 — source.
await d.waitForSelector("text=Connect a data source", { timeout: 60000 });
await shot(d, "04-step4-source", true);
await d.click("text=Manual"); await d.fill("#totalUsers", "4321"); await d.click("button[type=submit]");

// Steps 5 + 6 — optional, skipped.
for (let i = 0; i < 4 && !(await d.locator("text=Name your founder page").count()); i++) {
  const skip = d.locator("text=Skip for now");
  if (await skip.count()) await skip.first().click();
  await d.waitForTimeout(900);
}

// Step 7 — the profile, at the end, with the minted handle already filled in.
await d.waitForSelector("text=Name your founder page", { timeout: 60000 });
await shot(d, "05-step7-profile", true);
for (const w of [375, 768]) {
  const p = await page(w);
  await p.goto(`${base}/app/onboarding`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Name your founder page", { timeout: 60000 });
  await shot(p, `05-step7-profile-${w}`, true);
  await p.close();
}
const minted = await d.inputValue("#username");
console.log("minted handle:", minted);
const before = await d.evaluate(async (u) => (await fetch(u)).status, `${base}/api/v1/users/${minted}`);
console.log(`placeholder /api/v1/users/${minted} →`, before);
await d.fill("#username", `ada-${tag}`);
await d.waitForTimeout(1200);
await shot(d, "06-step7-profile-edited", true);
await d.locator("form button[type=submit]").last().click();

// Step 8 — publish.
await d.waitForSelector("text=Publish your growth page", { timeout: 60000 });
await shot(d, "07-step8-publish", true);
await d.click("text=Publish page");
await d.waitForSelector("text=on the board", { timeout: 60000 });
await shot(d, "08-done");

const after = await d.evaluate(async (u) => (await fetch(u)).status, `${base}/api/v1/users/ada-${tag}`);
console.log(`confirmed /api/v1/users/ada-${tag} →`, after);

const pub = await page(1440);
await pub.goto(`${base}/u/ada-${tag}`, { waitUntil: "networkidle" });
await shot(pub, "09-founder-page", true);
const p375 = await page(375);
await p375.goto(`${base}/u/ada-${tag}`, { waitUntil: "networkidle" });
await shot(p375, "09-founder-page-375", true);

console.log(JSON.stringify({ minted, mintedStatusBefore: before, ghostStatus: ghost, confirmedStatusAfter: after }));
await browser.close();
console.log("done");
