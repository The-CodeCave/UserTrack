// Usage: build with an unreachable NEXT_PUBLIC_CONVEX_URL, then PORT=3102 pnpm start and
// node scripts/shots-ops3.mjs [base]. Proves the degraded public pages and the error boundary.
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://localhost:3102";
const out = "docs/screenshots/v1/OPS-3";
const PAGES = [["degraded-home", "/"], ["degraded-leaderboard", "/leaderboard"], ["error-boundary", "/compare?s=demo-pixelpost&s=demo-northwind"]];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
for (const w of [375, 768, 1440]) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 });
  for (const [name, path] of PAGES) {
    await p.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);
    const file = `${out}/${name}-${w}.png`;
    await p.screenshot({ path: file });
    console.log("✓", file);
  }
  await p.close();
}
await ctx.close();
await browser.close();
