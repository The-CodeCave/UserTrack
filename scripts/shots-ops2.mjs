// Usage: pnpm build && PORT=3102 pnpm start, then node scripts/shots-ops2.mjs [base]
// OPS-2 is a caching change: the shots prove the cached public shell (client-rendered header auth) still
// renders identically at 375 / 768 / 1440 in dark and light.
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://localhost:3102";
const out = "docs/screenshots/v1/OPS-2";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const PAGES = [["home", "/"], ["leaderboard", "/leaderboard"], ["discover", "/discover"], ["project", "/s/demo-pixelpost"]];

for (const scheme of ["dark", "light"]) {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: scheme });
  for (const w of [375, 768, 1440]) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 });
    for (const [name, path] of PAGES) {
      await p.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1800);
      const file = `${out}/${name}-${w}${scheme === "light" ? "-light" : ""}.png`;
      await p.screenshot({ path: file });
      console.log("✓", file);
    }
    await p.close();
  }
  await ctx.close();
}
await browser.close();
