// v0.7 QA: founder profile, Share Studio, Share Center, social settings, onboarding — desktop + mobile.
// Usage: node scripts/shots-share.mjs [base=http://localhost:3010] [outDir=/tmp/ut-share-qa]
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const base = process.argv[2] ?? "http://localhost:3010";
const out = process.argv[3] ?? "/tmp/ut-share-qa";
const tag = Date.now().toString(36);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`); });
const shot = async (name, full = true, p = page) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log("✓", name); };

// Public founder profile + studio
await page.goto(`${base}/u/demo`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Users across all products");
await shot("founder-profile");
await page.getByRole("button", { name: "Share profile" }).click();
await page.waitForSelector("text=Share card · UserTrack Demo");
await page.waitForFunction(() => { const img = document.querySelector('img[alt="Share card preview"]'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 60000 });
await shot("studio-founder-blueprint", false);
await page.getByRole("button", { name: /Aurora/ }).click();
await page.waitForTimeout(300);
await page.waitForFunction(() => { const img = document.querySelector('img[alt="Share card preview"]'); return img && img.complete && img.naturalWidth > 0 && img.src.includes("aurora"); }, null, { timeout: 60000 });
await shot("studio-founder-aurora", false);
await page.getByRole("tab", { name: "1080 × 1080" }).click();
await page.getByRole("button", { name: /Minimal/ }).click();
await page.waitForFunction(() => { const img = document.querySelector('img[alt="Share card preview"]'); return img && img.complete && img.naturalWidth > 0 && img.src.includes("minimal") && img.src.includes("square"); }, null, { timeout: 60000 });
await shot("studio-founder-minimal-square", false);
await page.keyboard.press("Escape");

// Public SaaS page with share affordances + graph-to-card
await page.goto(`${base}/s/demo-northwind`, { waitUntil: "networkidle" });
await shot("saas-page-share-entry-points");
await page.getByRole("button", { name: "Share as card" }).first().click();
await page.waitForSelector("text=Timeframe");
await page.getByRole("tab", { name: "90D" }).click();
await page.waitForFunction(() => { const img = document.querySelector('img[alt="Share card preview"]'); return img && img.complete && img.naturalWidth > 0 && img.src.includes("90d"); }, null, { timeout: 60000 });
await shot("studio-graph-90d", false);
await page.keyboard.press("Escape");

// Signed-in flows: sign up → onboarding profile step (X handle) → manual product → publish
await page.goto(`${base}/sign-up`);
await page.fill("#name", "Share Tester");
await page.fill("#email", `share-${tag}@example.com`);
await page.fill("#password", "supersecret123");
await page.click("button[type=submit]");
await page.waitForURL("**/app/onboarding", { timeout: 60000 });
await page.waitForSelector("#username", { timeout: 60000 });
await shot("onboarding-profile-step", false);
await page.fill("#username", `share-${tag}`);
await page.fill("#x", "@ShareTester_1");
await page.click("button[type=submit]");
await page.click("text=Connect manually", { timeout: 60000 });
await page.waitForSelector("#name", { timeout: 60000 });
const slug = `share-saas-${tag}`;
await page.fill("#name", `Share SaaS ${tag}`);
await page.fill("#websiteUrl", `https://${slug}.example.com`);
await page.fill("#description", "Screenshot fixture product for v0.8.");
await page.selectOption("#category", "developer-tools");
await page.click("button[type=submit]");
await page.waitForSelector("text=What are you tracking?", { timeout: 60000 });
await page.click("text=Web SaaS");
await page.click("button:has-text('Continue')");
for (const pick of ["Other", "None", "Not monetized"]) {
  await page.waitForSelector("button[aria-pressed]", { timeout: 60000 });
  await page.click(`button[aria-pressed]:has-text('${pick}')`);
  await page.click("button:has-text('Continue'), button:has-text('Show recommendations')");
}
await page.waitForSelector("text=Connect a data source", { timeout: 60000 });
await page.click("text=Manual");
await page.fill("#totalUsers", "1234");
await page.click("button[type=submit]");
await page.waitForSelector("text=Track activation too?", { timeout: 60000 });
await page.getByRole("button", { name: "Skip for now" }).first().click();
await page.waitForSelector("text=Connect your payment provider?", { timeout: 60000 });
await page.getByRole("button", { name: "Skip for now" }).first().click();
await page.waitForSelector("text=Publish your growth page", { timeout: 60000 });
await page.click("text=Publish page");
await page.waitForSelector("text=on the board", { timeout: 60000 });

// Simulate a crossing so the Share Center has real events (runs the same hooks as the sync engine)
const mySlug = execSync(`cd ${process.cwd()} && npx convex data saas --limit 20 2>/dev/null`, { encoding: "utf8" }).split("\n").map((l) => l.match(/"slug":\s*"([^"]+)"/)?.[1]).filter((s) => s && s.startsWith("share-saas-")).pop();
if (mySlug) {
  execSync(`cd ${process.cwd()} && npx convex run seed:simulateGrowth '{"slug":"${mySlug}","totalUsers":1234}'`, { stdio: "inherit" });
  execSync(`cd ${process.cwd()} && npx convex run seed:simulateGrowth '{"slug":"${mySlug}","totalUsers":12480}'`, { stdio: "inherit" });
}

// Discover search: founder result with totals (the demo owner is excluded from search by design)
await page.goto(`${base}/discover`, { waitUntil: "networkidle" });
await page.getByLabel("Search").fill("Share Tester");
await page.waitForSelector("text=SaaS ·", { timeout: 30000 });
await shot("search-founder-result", false);

await page.goto(`${base}/app/share`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Ready to share", { timeout: 60000 });
await page.waitForTimeout(1500);
await shot("share-center");
await page.goto(`${base}/app/settings/social`, { waitUntil: "networkidle" });
await page.waitForSelector("text=X & sharing", { timeout: 60000 });
await shot("settings-social");
await page.goto(`${base}/app/profile`, { waitUntil: "networkidle" });
await page.waitForSelector("#x", { timeout: 60000 });
await shot("profile-form");
const dash = await page.goto(`${base}/app/saas`, { waitUntil: "networkidle" });
void dash;
await page.click(`text=Share SaaS ${tag}`);
await page.waitForSelector("text=Users over time", { timeout: 60000 });
await shot("dashboard-share-entry-points");

// Mobile
const cookies = await ctx.cookies();
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark", isMobile: true, hasTouch: true });
await mob.addCookies(cookies);
const m = await mob.newPage();
m.on("pageerror", (e) => errors.push(`mobile ${m.url()}: ${e.message}`));
await m.goto(`${base}/u/demo`, { waitUntil: "networkidle" });
await m.waitForSelector("text=Users across all products");
await shot("m-founder-profile", true, m);
await m.getByRole("button", { name: "Share profile" }).click();
await m.waitForFunction(() => { const img = document.querySelector('img[alt="Share card preview"]'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 60000 });
await shot("m-studio-top", false, m);
await m.evaluate(() => document.querySelector('[data-slot="dialog-content"]')?.scrollTo(0, 99999));
await shot("m-studio-controls", false, m);
await m.keyboard.press("Escape");
await m.goto(`${base}/app/share`, { waitUntil: "networkidle" });
await m.waitForSelector("text=Ready to share", { timeout: 60000 });
await m.waitForTimeout(1500);
await shot("m-share-center", true, m);
await m.goto(`${base}/app/settings/social`, { waitUntil: "networkidle" });
await m.waitForSelector("text=X & sharing", { timeout: 60000 });
await shot("m-settings-social", true, m);
await m.goto(`${base}/app/onboarding`, { waitUntil: "networkidle" }).catch(() => {});

await browser.close();
console.log(errors.length ? `CONSOLE/PAGE ERRORS:\n${errors.join("\n")}` : "no console errors");
console.log("DONE", `share-${tag}@example.com`);
