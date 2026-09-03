// Usage: node scripts/shot.mjs [baseUrl]  → writes docs/screenshots/*.png at 375/768/1440
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3101";
const out = "docs/screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const widths = [375, 768, 1440];
const saved = [];

async function shot(page, name) {
  const path = `${out}/${name}.png`;
  await page.waitForTimeout(400);
  await page.screenshot({ path, fullPage: true });
  saved.push(path);
}

for (const w of widths) {
  const page = await browser.newPage({ viewport: { width: w, height: w < 768 ? 812 : 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await shot(page, `landing-idle-${w}`);
  await page.fill("#email", "not-an-email");
  await page.click("button[type=submit]");
  await page.waitForSelector("[role=alert]");
  await shot(page, `landing-error-${w}`);
  await page.fill("#email", `shot-${w}@example.com`);
  await page.click("button[type=submit]");
  await page.waitForSelector("[role=status]");
  await shot(page, `landing-success-${w}`);
  await page.goto(`${base}/impressum`, { waitUntil: "networkidle" });
  await shot(page, `impressum-${w}`);
  await page.goto(`${base}/privacy`, { waitUntil: "networkidle" });
  await shot(page, `privacy-${w}`);
  await page.close();
}
await browser.close();
console.log(saved.join("\n"));
