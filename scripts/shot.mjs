// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [full]
import { chromium } from "playwright-core";

const [url, out, w = "1440", h = "900", full = ""] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2, colorScheme: "dark" });
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: full === "full" });
await browser.close();
console.log("saved", out);
