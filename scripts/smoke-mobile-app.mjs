// Mobile App onboarding smoke: platform → identity (Firebase + Sign in with Apple) → RevenueCat → PostHog → recommendation → activation → conversion step. Screenshots to /tmp/ut-shots.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
const base = process.argv[2] ?? "http://localhost:3005";
const mobile = process.argv[3] === "mobile";
const tag = Date.now().toString(36);
const email = `mob-${tag}@example.com`;
const out = (n) => `/tmp/ut-shots/mob-${mobile ? "m" : "d"}-${n}.png`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: out(n), fullPage: true }); console.log("✓", n); };
await page.goto(`${base}/sign-up`);
await page.fill("#name", "Mobile Tester"); await page.fill("#email", email); await page.fill("#password", "supersecret123");
await page.click("button[type=submit]");
// Sign-up stops at "check your inbox"; there is no mail in dev, so verify through the component adapter and sign in.
await page.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
execSync(`npx convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
await page.goto(`${base}/sign-in`);
await page.fill("#email", email); await page.fill("#password", "supersecret123"); await page.click("button[type=submit]");
await page.waitForSelector("#displayName", { timeout: 30000 });
await page.fill("#username", `mob-${tag}`); await page.click("button[type=submit]");
await page.click("text=Connect manually", { timeout: 30000 });
await page.waitForSelector("#name", { timeout: 30000 });
await page.fill("#name", `Focus App ${tag}`); await page.fill("#websiteUrl", "https://focusapp.example.com"); await page.fill("#description", "A focus timer app for iOS and Android."); await page.selectOption("#category", "productivity");
await page.click("button[type=submit]");
await page.waitForSelector("text=What are you tracking?", { timeout: 30000 });
await shot("01-platform");
await page.click("text=Mobile App"); await shot("02-platform-mobile-selected");
await page.click("button:has-text('Continue')");
await page.waitForSelector("button[aria-pressed]", { timeout: 30000 });
await shot("03-identity");
await page.click("button[aria-pressed]:has-text('Firebase')");
// auth methods (if shown)
const apple = page.locator("button[aria-pressed]:has-text('Sign in with Apple')");
if (await apple.count()) { await apple.click(); await shot("04-identity-auth-methods"); }
await page.click("button:has-text('Continue')");
await page.waitForSelector("text=How do you monetize?", { timeout: 30000 });
await page.click("button[aria-pressed]:has-text('RevenueCat')"); await shot("05-monetization");
await page.click("button:has-text('Continue')");
await page.waitForSelector("text=How do you track product usage?", { timeout: 30000 });
await page.click("button[aria-pressed]:has-text('PostHog')"); await shot("06-analytics");
await page.click("button:has-text('Show recommendations')");
await page.waitForSelector("text=Connect a data source", { timeout: 30000 });
await shot("07-recommendation");
await page.click("text=Manual"); await page.fill("#totalUsers", "5491"); await page.click("button[type=submit]");
await page.waitForSelector("text=Track activation too", { timeout: 30000 }); await shot("08-activation");
await page.click("text=Skip for now");
await page.waitForSelector("text=Connect your payment provider", { timeout: 30000 }); await shot("09-conversion-step");
const rc = page.locator("text=RevenueCat").first();
if (await rc.count()) { await rc.click(); await page.waitForTimeout(800); await shot("10-revenuecat-form"); }
console.log("MOBILE ONB OK");
await browser.close();
