// End-to-end smoke: sign up → onboarding (profile, SaaS, manual source, publish) → public page. Screenshots to /tmp/ut-shots.
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const mobile = process.argv[3] === "mobile";
const tag = Date.now().toString(36);
const email = `smoke-${tag}@example.com`;
const out = (n) => `/tmp/ut-shots/flow-${mobile ? "m" : "d"}-${n}.png`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const step = async (n, fn) => { await fn(); await page.waitForTimeout(600); await page.screenshot({ path: out(n), fullPage: true }); console.log("✓", n, page.url()); };

await step("01-signup", async () => {
  await page.goto(`${base}/sign-up`);
  await page.fill("#name", "Smoke Tester");
  await page.fill("#email", email);
  await page.fill("#password", "supersecret123");
});
await step("02-onboarding-profile", async () => {
  await page.click("button[type=submit]");
  await page.waitForURL("**/app/onboarding", { timeout: 30000 });
  await page.waitForSelector("#displayName", { timeout: 30000 });
});
await step("03-onboarding-saas", async () => {
  await page.fill("#username", `smoke-${tag}`);
  await page.click("button[type=submit]");
  await page.waitForSelector("#name", { timeout: 30000 });
  await page.fill("#name", `Smoke SaaS ${tag}`);
  await page.fill("#websiteUrl", "https://smoke.example.com");
  await page.fill("#description", "Smoke-test product created by the e2e script.");
  await page.selectOption("#category", "developer-tools");
  await page.fill("#tags", "testing, e2e");
});
await step("04-onboarding-source", async () => {
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Connect a data source", { timeout: 30000 });
  await page.click("text=Manual");
  await page.fill("#totalUsers", "1234");
});
await step("05-onboarding-publish", async () => {
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Publish your growth page", { timeout: 30000 });
  await page.waitForSelector("text=1,234", { timeout: 30000 });
});
await step("06-celebrate", async () => {
  await page.click("text=Publish page");
  await page.waitForSelector("text=on the board", { timeout: 30000 });
});
const slugLink = await page.locator("a:has-text('Open page')").getAttribute("href");
await step("07-public-page", async () => { await page.goto(slugLink); await page.waitForSelector("text=Self-reported"); });
await step("08-dashboard", async () => { await page.goto(`${base}/app`); await page.waitForSelector("text=Your growth at a glance", { timeout: 30000 }); });
await step("09-manage", async () => { await page.goto(`${base}/app/saas`); await page.click(`text=Smoke SaaS ${tag}`); await page.waitForSelector("text=User count source", { timeout: 30000 }); });
await step("10-signed-out-redirect", async () => {
  await page.context().clearCookies();
  await page.goto(`${base}/app`);
  await page.waitForURL("**/sign-in**", { timeout: 30000 });
});
await browser.close();
console.log("SMOKE OK", email, slugLink);
