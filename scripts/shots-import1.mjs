import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
// Usage: npx convex env set TRUSTMRR_API_KEY fixture; pnpm build && PORT=3005 pnpm start, then BASE=http://localhost:3005 node scripts/shots-import1.mjs
const base = process.env.BASE ?? "http://localhost:3005", out = "docs/screenshots/v1/IMPORT-1";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name, full = false) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log("✓", name); };
const formShot = async (p, name) => { await p.waitForTimeout(700); await p.locator("[data-testid=trustmrr-import]").locator("xpath=ancestor::form").screenshot({ path: `${out}/${name}.png` }); console.log("✓", name); };
process.on("unhandledRejection", async (e) => { console.error(e); for (const p of ctx.pages()) await p.screenshot({ path: `/tmp/ut-fail-${ctx.pages().indexOf(p)}.png` }).catch(() => {}); process.exit(1); });

const tag = Date.now().toString(36), email = `import1-${tag}@example.com`;
const d = await page(1440);
await d.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
await d.fill("#name", "Import Shot"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
await d.click("button[type=submit]"); await d.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
execSync(`npx convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
await d.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
await d.fill("#email", email); await d.fill("#password", "supersecret123"); await d.click("button[type=submit]");
await d.waitForURL("**/app/onboarding", { timeout: 30000 });
await d.waitForSelector("#displayName", { timeout: 30000 }); await d.fill("#username", `import1-${tag}`); await d.click("button[type=submit]");
await d.click("text=Connect manually", { timeout: 30000 }); await d.waitForSelector("#name", { timeout: 30000 });
await d.fill("#name", "Boilerplate"); await d.fill("#websiteUrl", "https://boilerplate.example.com"); await d.fill("#description", "Ship faster."); await d.selectOption("#category", "developer-tools");
await d.click("button[type=submit]"); await d.waitForSelector("text=What are you tracking?", { timeout: 30000 });
await d.locator("button", { hasText: /web/i }).first().click(); await d.click("button:has-text('Continue')"); await d.waitForTimeout(900);
for (let i = 0; i < 8 && !(await d.locator("text=Connect a data source").count()); i++) {
  const opt = d.locator("button[aria-pressed=false]");
  if (await opt.count()) { await opt.first().click(); await d.waitForTimeout(300); }
  await d.click("button:has-text('Continue'):enabled, button:has-text('Show recommendations'):enabled"); await d.waitForTimeout(900);
}
await d.waitForSelector("text=Connect a data source", { timeout: 30000 }); await d.click("text=Manual"); await d.fill("#totalUsers", "1200"); await d.click("button[type=submit]");
for (let i = 0; i < 6 && !(await d.locator("text=Publish page").count()); i++) {
  const skip = d.locator("text=Skip for now");
  if (await skip.count()) await skip.first().click();
  await d.waitForTimeout(900);
}
await d.click("text=Publish page"); await d.waitForSelector("text=on the board", { timeout: 30000 });
await d.goto(`${base}/app`, { waitUntil: "networkidle" });
const link = d.locator("a[href^='/app/saas/']:not([href$='/new'])").first(); await link.waitFor({ timeout: 30000 });
const id = (await link.getAttribute("href")).split("/").pop();
console.log("project", id);

// Edit form: import row → preview → overwrite → apply → highlighted form → save → public link.
const openImport = async (p) => { await p.goto(`${base}/app/saas/${id}#settings`, { waitUntil: "networkidle" }); await p.waitForSelector("[data-testid=trustmrr-open]", { timeout: 30000 }); await p.locator("[data-testid=trustmrr-import]").scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await p.click("[data-testid=trustmrr-open]"); await p.waitForSelector("[data-testid=trustmrr-row]"); };
await openImport(d);
await shot(d, "import-row-1440");
await d.fill("[aria-label='TrustMRR URL or slug']", "ghost-startup"); await d.click("[data-testid=trustmrr-run]"); await d.waitForSelector("[role=alert]", { timeout: 30000 });
await shot(d, "import-not-found-1440");
await d.fill("[aria-label='TrustMRR URL or slug']", "https://trustmrr.com/startup/shipfast"); await d.click("[data-testid=trustmrr-run]"); await d.waitForSelector("[data-testid=trustmrr-preview]", { timeout: 30000 });
await d.locator("[data-testid=trustmrr-preview]").scrollIntoViewIfNeeded();
await shot(d, "import-preview-1440");
await d.check("[data-testid=trustmrr-overwrite]"); await shot(d, "import-preview-overwrite-1440");
await d.click("[data-testid=trustmrr-apply]"); await d.waitForTimeout(600);
await formShot(d, "import-applied-form-1440");
await d.click("button:has-text('Save changes')"); await d.waitForSelector("text=Saved", { timeout: 30000 });
const slug = await d.inputValue("#slug");
await d.goto(`${base}/s/${slug}`, { waitUntil: "networkidle" }); await d.waitForSelector("text=Also on TrustMRR", { timeout: 30000 });
await shot(d, "public-also-on-trustmrr-1440");

// New-project form (manual path) shows the same button.
try {
  await d.goto(`${base}/app/saas/new`, { waitUntil: "networkidle" });
  await d.locator("button, a", { hasText: /manual/i }).first().click(); await d.waitForTimeout(600);
  await d.locator("button", { hasText: /web/i }).first().click(); await d.click("button:has-text('Continue')");
  await d.waitForSelector("[data-testid=trustmrr-open]", { timeout: 15000 }); await d.click("[data-testid=trustmrr-open]");
  await d.fill("[aria-label='TrustMRR URL or slug']", "shipfast"); await d.click("[data-testid=trustmrr-run]"); await d.waitForSelector("[data-testid=trustmrr-preview]", { timeout: 30000 });
  await shot(d, "new-form-preview-1440");
  await d.click("[data-testid=trustmrr-apply]"); await d.waitForTimeout(600); await formShot(d, "new-form-applied-1440");
} catch (e) { console.warn("new-form shots skipped:", e.message.split("\n")[0]); }

const cookies = await d.context().cookies();
for (const w of [768, 375]) {
  const m = await page(w); await m.context().addCookies(cookies);
  await openImport(m); await shot(m, `import-row-${w}`);
  await m.fill("[aria-label='TrustMRR URL or slug']", "shipfast"); await m.click("[data-testid=trustmrr-run]"); await m.waitForSelector("[data-testid=trustmrr-preview]", { timeout: 30000 });
  await m.locator("[data-testid=trustmrr-preview]").scrollIntoViewIfNeeded(); await shot(m, `import-preview-${w}`);
  if (w === 375) { await m.click("[data-testid=trustmrr-apply]"); await m.waitForTimeout(600); await formShot(m, "import-applied-form-375"); await m.goto(`${base}/s/${slug}`, { waitUntil: "networkidle" }); await shot(m, "public-also-on-trustmrr-375"); }
  await m.close();
}

// Not configured: remove the key, the status query flips and the button disables.
execSync("npx convex env remove TRUSTMRR_API_KEY", { stdio: "inherit" });
await d.goto(`${base}/app/saas/${id}#settings`, { waitUntil: "networkidle" }); await d.waitForSelector("text=Not configured", { timeout: 60000 });
await d.locator("[data-testid=trustmrr-import]").scrollIntoViewIfNeeded(); await shot(d, "import-not-configured-1440");
execSync("npx convex env set TRUSTMRR_API_KEY fixture", { stdio: "inherit" });
await browser.close(); console.log("DONE", email, id, slug);
