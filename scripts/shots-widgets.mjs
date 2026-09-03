// Widget screenshots: sign up → onboarding → publish → embed on a foreign host page (127.0.0.1:8787 serving /tmp/ut-host) → dashboard, configurator, public page. Output: /tmp/ut-shots.
import { chromium } from "playwright-core";
import { writeFileSync, readFileSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3000";
const tag = Date.now().toString(36);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const page = await ctx.newPage();
await page.goto(`${base}/sign-up`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
await page.fill("#name", "Widget Tester"); await page.fill("#email", `widget-${tag}@example.com`); await page.fill("#password", "supersecret123");
await page.click("button[type=submit]"); await page.waitForURL("**/app/onboarding", { timeout: 30000 }); await page.waitForSelector("#displayName", { timeout: 30000 });
await page.fill("#username", `widget-${tag}`); await page.click("button[type=submit]");
await page.click("text=Connect manually", { timeout: 30000 }); await page.waitForSelector("#name", { timeout: 30000 });
await page.fill("#name", `Acme Cloud`); await page.fill("#websiteUrl", `https://acme-${tag}.example.com`); await page.fill("#description", "Team workspaces for fast-moving product teams."); await page.selectOption("#category", "developer-tools"); await page.fill("#tags", "saas, teams");
await page.click("button[type=submit]"); await page.waitForSelector("text=What are you tracking?", { timeout: 30000 }); await page.click("text=Web SaaS"); await page.click("button:has-text('Continue')");
for (const pick of ["Other", "None", "Not monetized"]) { await page.waitForSelector("button[aria-pressed]", { timeout: 30000 }); await page.click(`button[aria-pressed]:has-text('${pick}')`); await page.click("button:has-text('Continue'), button:has-text('Show recommendations')"); }
await page.waitForSelector("text=Connect a data source", { timeout: 30000 }); await page.click("text=Manual"); await page.fill("#totalUsers", "12481");
await page.click("button[type=submit]"); await page.waitForSelector("text=Track activation too", { timeout: 30000 }); await page.click("text=Skip for now");
await page.waitForSelector("text=Connect your payment provider", { timeout: 30000 }); await page.click("text=Skip for now");
await page.waitForSelector("text=Publish your growth page", { timeout: 30000 }); await page.click("text=Publish page"); await page.waitForSelector("text=on the board", { timeout: 30000 });
const slug = new URL(await page.locator("a:has-text('Open page')").getAttribute("href")).pathname.split("/").pop();
console.log("slug", slug);
// Embed on a "foreign" host page (127.0.0.1:8787) so the dashboard has something to show.
const tpl = readFileSync("/tmp/ut-host/index.html", "utf8").replaceAll("__BASE__", base).replaceAll("__SLUG__", slug);
writeFileSync(`/tmp/ut-host/${slug}.html`, tpl);
await page.goto(`http://127.0.0.1:8787/${slug}.html`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/ut-shots/own-host-1440.png" });
// Dashboard: manage page #embeds, configurator (widget + badge), overview next actions.
await page.goto(`${base}/app/saas`); await page.click("text=Acme Cloud"); await page.waitForSelector("text=Identity source", { timeout: 30000 });
const id = page.url().split("/").pop();
await page.goto(`${base}/app/saas/${id}#embeds`, { waitUntil: "networkidle" }); await page.waitForSelector("text=Embedded on", { timeout: 30000 }); await page.waitForTimeout(800);
const emb = page.locator("#embeds"); await emb.scrollIntoViewIfNeeded(); await emb.screenshot({ path: "/tmp/ut-shots/manage-embeds.png" });
await page.goto(`${base}/app/saas/${id}/embed`, { waitUntil: "networkidle" }); await page.waitForSelector("text=Where it", { timeout: 30000 }); await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/ut-shots/configurator-1440.png", fullPage: true });
await page.click("button:has-text('Mini chart')"); await page.click("button:has-text('light')"); await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/ut-shots/configurator-chart-light.png", fullPage: true });
await page.click("button:has-text('SVG badge')"); await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/ut-shots/configurator-badge.png", fullPage: true });
// Public page section.
await page.goto(`${base}/s/${slug}`, { waitUntil: "networkidle" }); const sec = page.locator("text=Share & embed").locator(".."); await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await sec.screenshot({ path: "/tmp/ut-shots/public-embed.png" });
// Mobile configurator.
const mob = await ctx.newPage(); await mob.setViewportSize({ width: 375, height: 812 });
await mob.goto(`${base}/app/saas/${id}/embed`, { waitUntil: "networkidle" }); await mob.waitForSelector("text=Where it", { timeout: 30000 }); await mob.waitForTimeout(1500);
await mob.screenshot({ path: "/tmp/ut-shots/configurator-375.png", fullPage: true });
await browser.close(); console.log("done");
