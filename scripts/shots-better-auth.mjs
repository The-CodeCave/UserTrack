// Screenshots of the Better Auth setup flow against the local dev server.
// Usage: node scripts/shots-better-auth.mjs <phase> [tunnelUrl]
//   phase "create": sign up, create project, open Better Auth wizard, create integration → writes /tmp/ut-ba/state.json
//   phase "verify": reuse the session, verify (expects the sample app to be reachable) → success shots + mobile + docs
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const [phase, tunnel = "https://shot.example.com"] = process.argv.slice(2);
const base = process.env.UT_BASE ?? "http://localhost:3005";
mkdirSync("/tmp/ut-ba", { recursive: true });
const shot = async (page, name, full = true) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/ut-ba/${name}.png`, fullPage: full }); console.log("✓", name); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const page = await ctx.newPage();
process.on("unhandledRejection", async (e) => { console.error(String(e).split("\n")[0]); await page.screenshot({ path: "/tmp/ut-ba/debug.png" }).catch(() => {}); process.exit(1); });

try {
if (phase === "create") {
  const tag = Date.now().toString(36);
  await page.goto(`${base}/sign-up`);
  await page.fill("#name", "BA Tester"); await page.fill("#email", `ba-${tag}@example.com`); await page.fill("#password", "supersecret123");
  await page.click("button[type=submit]"); await page.waitForURL("**/app/onboarding", { timeout: 60000 });
  await page.waitForSelector("#username", { timeout: 60000 }); await page.fill("#username", `ba-${tag}`); await page.click("button[type=submit]");
  await page.waitForSelector("text=Set up with AI", { timeout: 60000 });
  await page.locator("button:has-text('Set up with AI')").locator("xpath=following-sibling::button[1]").click();
  await page.waitForSelector("#name", { timeout: 60000 });
  await page.fill("#name", `BA SaaS ${tag}`); await page.fill("#websiteUrl", tunnel); await page.fill("#description", "Better Auth screenshot fixture."); await page.selectOption("#category", "developer-tools");
  await page.click("button[type=submit]");
  await page.waitForSelector("text=What are you tracking?", { timeout: 60000 });
  await page.click("button:has-text('Web SaaS')"); await page.click("button[type=submit]");
  await page.waitForSelector("text=How do users sign in?", { timeout: 60000 });
  await page.click("button:has-text('Better Auth')"); await page.click("button:has-text('Continue')");
  await page.click("button:has-text('None')"); await page.click("button:has-text('Continue')");
  await page.click("button:has-text('Not monetized')"); await page.click("button:has-text('Show recommendations')");
  await page.waitForSelector("text=Connect a data source", { timeout: 60000 });
  await shot(page, "01-onboarding-source-cards");
  await page.click("button:has-text('Better Auth')");
  await page.waitForSelector("text=Create integration", { timeout: 30000 });
  await shot(page, "02-wizard-create");
  await page.click("button:has-text('Create integration')");
  await page.waitForSelector("text=Your integration secret", { timeout: 30000 });
  await shot(page, "03-wizard-install-secret");
  const env = await page.locator("code").filter({ hasText: "USERTRACK_SECRET=" }).first().innerText();
  const projectId = /USERTRACK_PROJECT_ID=(\S+)/.exec(env)[1]; const secret = /USERTRACK_SECRET=(\S+)/.exec(env)[1];
  await page.click("text=Deployed — verify now");
  await page.click("button:has-text('Verify integration')");
  await page.waitForSelector("text=Could not read from this source", { timeout: 60000 });
  await shot(page, "04-verify-not-deployed-error");
  const cookies = await ctx.cookies();
  writeFileSync("/tmp/ut-ba/state.json", JSON.stringify({ projectId, secret, cookies, url: page.url() }));
  console.log("STATE", projectId);
} else {
  const state = JSON.parse(readFileSync("/tmp/ut-ba/state.json", "utf8"));
  await ctx.addCookies(state.cookies);
  await page.goto(`${base}/app/onboarding`, { waitUntil: "networkidle" });
  for (let i = 0; i < 20 && !(await page.locator("text=Connect a data source").count()); i++) {
    for (const sel of ["button:has-text('Web SaaS')", "button:has-text('Better Auth')", "button:has-text('None')", "button:has-text('Not monetized')"]) { const b = page.locator(sel).first(); if (await b.count()) { await b.click(); break; } }
    for (const sel of ["button[type=submit]", "button:has-text('Show recommendations')", "button:has-text('Continue')"]) { const b = page.locator(sel).first(); if (await b.count() && await b.isEnabled()) { await b.click(); break; } }
    await page.waitForTimeout(900);
  }
  await page.waitForSelector("text=Connect a data source", { timeout: 60000 });
  await page.click("button:has-text('Better Auth')");
  await page.waitForSelector("text=Create integration", { timeout: 30000 });
  await page.click("button:has-text('Create integration')");
  await page.waitForSelector("text=Rotate secret", { timeout: 30000 });
  await shot(page, "05-wizard-existing-integration");
  await page.click("text=Deployed — verify now");
  await page.click("button:has-text('Verify integration')");
  await page.waitForSelector("text=Verified via Better Auth", { timeout: 90000 });
  await shot(page, "06-verify-success");
  await page.waitForTimeout(1500);
  for (const t of ["Skip for now", "Skip for now"]) { const b = page.locator(`button:has-text('${t}')`).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(800); } }
  const pub = page.locator("button:has-text('Publish page')").first(); if (await pub.count()) { await pub.click(); await page.waitForTimeout(2500); }
  await page.waitForTimeout(6000);
  await page.goto(`${base}/app/saas/${state.projectId}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  await shot(page, "07-project-connected");
  await page.goto(`${base}/s/${new URL(state.url).pathname.split("/").pop()}`).catch(() => {});
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await mob.addCookies(state.cookies);
  const m = await mob.newPage();
  await m.goto(`${base}/app/saas/${state.projectId}`, { waitUntil: "networkidle" }); await m.waitForTimeout(1200);
  await shot(m, "08-project-connected-mobile", false);
  await m.goto(`${base}/developers/integrations/better-auth`, { waitUntil: "networkidle" }); await shot(m, "09-docs-mobile");
  await page.goto(`${base}/developers/integrations/better-auth`, { waitUntil: "networkidle" }); await shot(page, "10-docs-desktop");
  const light = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
  const l = await light.newPage(); await l.goto(`${base}/developers/integrations/better-auth`, { waitUntil: "networkidle" }); await shot(l, "11-docs-light", false);
}
} catch (e) { console.error("FAILED:", String(e.stack ?? e).split("\n").slice(0, 3).join(" / ")); await page.screenshot({ path: "/tmp/ut-ba/debug.png" }).catch(() => {}); await browser.close(); process.exit(1); }
await browser.close();
