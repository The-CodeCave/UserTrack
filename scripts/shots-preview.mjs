// v1.0.2 QA: the URL-first landing hero and /preview — happy path, already-claimed domain and every failure mode.
// Each scenario gets its own x-forwarded-for so the per-IP preview limit (10/h) does not bleed between shots.
// Usage: node scripts/shots-preview.mjs [base=http://localhost:3212] [outDir=/tmp/ut-preview-qa]
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const base = process.argv[2] ?? "http://localhost:3212";
const out = process.argv[3] ?? "/tmp/ut-preview-qa";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
// Fresh /24 per run, so re-running the script never spends a bucket a previous run already used.
const net = 1 + Math.floor(Math.random() * 250);
let ip = 1;

const open = async (width, height) => {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    extraHTTPHeaders: { "x-forwarded-for": `198.51.${net}.${ip++}` },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`); });
  return { ctx, page };
};

const shot = async (page, name, full = true) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  console.log("✓", name);
};

// Types a domain into the hero field and follows it to /preview, exactly like a visitor would.
async function fromHero(page, url) {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByLabel("Your website address").first().fill(url);
  await page.getByRole("button", { name: /Show my page/ }).first().click();
  await page.waitForURL("**/preview");
}

for (const [label, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
  const { ctx, page } = await open(width, height);

  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await shot(page, `hero-${label}`, false);
  await shot(page, `landing-full-${label}`);

  // (b) real data: name, tagline, logo, PostHog off their own <head>, category peers off the public board
  await fromHero(page, "resend.com");
  await page.waitForSelector("text=What your homepage already told us", { timeout: 30000 });
  await shot(page, `preview-real-${label}`);

  // (c) a domain that is already a public growth page
  await fromHero(page, "usertrack.dev");
  await page.waitForSelector("text=Already on the board", { timeout: 30000 });
  await shot(page, `preview-claimed-${label}`);

  await ctx.close();
}

// (d) failure modes — desktop only, each with a fresh limit bucket
const cases = [
  ["error-unreachable", "no-such-domain-ut-9f3a4b.com", "text=Could not reach"],
  ["error-bot-blocked", "www.g2.com", "text=answered 403"],
  ["error-garbage", "not a website", "text=does not look like a public website"],
  ["error-app-store", "https://apps.apple.com/us/app/things-3/id904280696", "text=store listing"],
];
for (const [name, url, expect] of cases) {
  const { ctx, page } = await open(1440, 900);
  await page.goto(`${base}/preview`, { waitUntil: "networkidle" });
  await page.getByLabel("Your website address").first().fill(url);
  await page.getByRole("button", { name: /Show my page/ }).first().click();
  await page.waitForSelector(expect, { timeout: 30000 });
  await shot(page, name, false);
  await ctx.close();
}

// The limit itself: spend one IP's hourly budget, then show what the 11th visitor sees
const { ctx, page } = await open(1440, 900);
await page.goto(`${base}/preview`, { waitUntil: "networkidle" });
for (let i = 0; i < 14; i++) {
  await page.getByLabel("Your website address").first().fill(`no-such-domain-ut-9f3a4b-${i}.com`);
  await page.getByRole("button", { name: /Show my page/ }).first().click();
  await page.waitForTimeout(500);
  if (await page.getByText("Too many previews").isVisible().catch(() => false)) break;
}
await page.waitForSelector("text=Too many previews", { timeout: 30000 });
await shot(page, "error-rate-limited", false);
await ctx.close();

// The payoff: preview → sign-up → the wizard already knows the answers (same tab, so sessionStorage survives).
{
  const { ctx, page } = await open(1440, 900);
  const tag = Date.now().toString(36);
  const email = `preview-${tag}@example.com`;
  await fromHero(page, "resend.com");
  await page.waitForSelector("text=What your homepage already told us", { timeout: 30000 });
  await page.click("text=Claim this page");
  await page.waitForURL("**/sign-up**");
  await page.fill("#name", "Ada Lovelace");
  await page.fill("#email", email);
  await page.fill("#password", "supersecret123");
  await page.click("button[type=submit]");
  await page.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
  const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
  execSync(`pnpm exec convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", "supersecret123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/app/onboarding", { timeout: 30000 });
  await page.waitForSelector("#displayName", { timeout: 30000 });
  await page.fill("#username", `ada-${tag}`);
  await page.click("button[type=submit]");
  await page.click("text=Connect manually", { timeout: 30000 });
  await page.waitForSelector("#websiteUrl", { timeout: 30000 });
  await shot(page, "onboarding-prefilled", true);
  await ctx.close();
}

await browser.close();
console.log(errors.length ? `\n⚠ console/page errors:\n${[...new Set(errors)].join("\n")}` : "\nNo console or page errors.");
