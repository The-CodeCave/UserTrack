// End-to-end smoke: sign up → verify → onboarding (website, product, agent handoff, live, source, publish, profile) → public page. Screenshots to /tmp/ut-shots.
// The Convex deployment's SITE_URL must match the port `base` points at, or Better Auth rejects the sign-up as an untrusted origin (A208).
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

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
await step("02a-check-inbox", async () => {
  await page.click("button[type=submit]");
  await page.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
});
await step("02-onboarding", async () => {
  // SEC-1 requires a verified address before sign-in; the token only reaches the inbox, so flip the flag through the component adapter.
  const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
  execSync(`npx convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
  await page.goto(`${base}/sign-in`);
  await page.fill("#email", email);
  await page.fill("#password", "supersecret123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/app/onboarding", { timeout: 30000 });
});
await step("03-onboarding-website", async () => {
  await page.waitForSelector("[data-testid=site-step-url]", { timeout: 30000 });
  await page.fill("[data-testid=site-step-url]", "https://example.com");
});
await step("04-onboarding-product", async () => {
  await page.click("button[type=submit]");
  await page.waitForSelector("#description", { timeout: 60000 });
  await page.fill("#name", `Smoke SaaS ${tag}`);
  await page.fill("#description", "Smoke-test product created by the e2e script.");
});
await step("05-onboarding-agent", async () => {
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Hand it to your coding agent", { timeout: 60000 });
  await page.waitForSelector("text=Copy instructions to LLM", { timeout: 30000 });
});
await step("06-onboarding-live", async () => {
  await page.click("button:has-text(\"I've told my agent\")");
  await page.waitForSelector("text=Live status", { timeout: 60000 });
  await page.waitForSelector("text=UserTrack project created", { timeout: 30000 });
});
// The agent normally does this over MCP; the escape hatch is the same wizard, so it stands in for it here.
await step("07-onboarding-source", async () => {
  await page.click("button:has-text('Connect a source myself')");
  await page.waitForSelector("text=Where does your user count come from?", { timeout: 30000 });
  await page.click("button:has-text('Manual')");
  await page.waitForSelector("#totalUsers", { timeout: 20000 });
  await page.fill("#totalUsers", "1234");
});
await step("07b-onboarding-publish", async () => {
  await page.click("button[type=submit]:has-text('Connect')");
  await page.waitForSelector("text=Live status", { timeout: 60000 });
  await page.locator("button:has-text('Publish now')").click({ timeout: 60000 });
});
await step("07c-onboarding-profile", async () => {
  await page.waitForSelector("#username", { timeout: 60000 });
  await page.fill("#username", `smoke-${tag}`);
  await page.click("button[type=submit]");
  await page.waitForSelector("text=You're live on UserTrack.", { timeout: 60000 });
});
// Resolved against `base` so the script works when the dev server is not on the configured site URL.
const slugLink = new URL(new URL(await page.locator("a:has-text('View public page')").getAttribute("href")).pathname, base).href;
await step("08-public-page", async () => { await page.goto(slugLink); await page.waitForSelector("text=Self-reported"); });
await step("09-dashboard", async () => { await page.goto(`${base}/app`); await page.waitForSelector("text=Your growth at a glance", { timeout: 30000 }); });
await step("10-manage", async () => { await page.goto(`${base}/app/saas`); await page.click(`text=Smoke SaaS ${tag}`); await page.waitForSelector("text=Identity source", { timeout: 30000 }); await page.waitForSelector("text=Connection ≠ publication", { timeout: 30000 }); });
await step("11-signed-out-redirect", async () => {
  await page.context().clearCookies();
  await page.goto(`${base}/app`);
  await page.waitForURL("**/sign-in**", { timeout: 30000 });
});
await browser.close();
console.log("SMOKE OK", email, slugLink);
