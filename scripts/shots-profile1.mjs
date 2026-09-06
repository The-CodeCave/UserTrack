import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
// Usage: pnpm build && PORT=3005 pnpm start (port = dev SITE_URL), then BASE=http://localhost:3005 node scripts/shots-profile1.mjs
const base = process.env.BASE ?? "http://localhost:3005", out = "docs/screenshots/v1/PROFILE-1";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name, full = false) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log("✓", name); };
process.on("unhandledRejection", async (e) => { console.error(e); for (const p of ctx.pages()) await p.screenshot({ path: `/tmp/ut-fail-${ctx.pages().indexOf(p)}.png` }).catch(() => {}); process.exit(1); });

// Throwaway password account, verified through the component adapter (no mail in dev), then the shortest onboarding path.
const tag = Date.now().toString(36), email = `profile1-${tag}@example.com`, slug = `stacked-${tag}`;
const d = await page(1440);
await d.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
await d.fill("#name", "Profile Shot"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
await d.click("button[type=submit]"); await d.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
execSync(`npx convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
await d.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
await d.fill("#email", email); await d.fill("#password", "supersecret123"); await d.click("button[type=submit]");
await d.waitForURL("**/app/onboarding", { timeout: 30000 });
await d.waitForSelector("#displayName", { timeout: 30000 }); await d.fill("#username", `profile1-${tag}`); await d.fill("#x", "adalovelace"); await d.click("button[type=submit]");
await d.click("text=Connect manually", { timeout: 30000 }); await d.waitForSelector("#name", { timeout: 30000 });
await d.fill("#name", "Stacked"); await d.fill("#websiteUrl", "https://stacked.example.com"); await d.fill("#description", "Growth analytics for indie SaaS teams who ship weekly."); await d.selectOption("#category", "analytics");
await d.click("button[type=submit]"); await d.waitForSelector("text=What are you tracking?", { timeout: 30000 });
await d.locator("button", { hasText: /web/i }).first().click(); await d.click("button:has-text('Continue')"); await d.waitForTimeout(900);
for (let i = 0; i < 8 && !(await d.locator("text=Connect a data source").count()); i++) {
  const opt = d.locator("button[aria-pressed=false]");
  if (await opt.count()) { await opt.first().click(); await d.waitForTimeout(300); }
  await d.click("button:has-text('Continue'):enabled, button:has-text('Show recommendations'):enabled"); await d.waitForTimeout(900);
}
await d.waitForSelector("text=Connect a data source", { timeout: 30000 }); await d.click("text=Manual"); await d.fill("#totalUsers", "4321"); await d.click("button[type=submit]");
for (let i = 0; i < 6 && !(await d.locator("text=Publish page").count()); i++) {
  const skip = d.locator("text=Skip for now");
  if (await skip.count()) await skip.first().click();
  await d.waitForTimeout(900);
}
await d.click("text=Publish page"); await d.waitForSelector("text=on the board", { timeout: 30000 });
const projectUrl = await d.evaluate(() => location.pathname.replace(/\/onboarding.*$/, ""));
await d.goto(`${base}/app`, { waitUntil: "networkidle" });
const link = d.locator("a[href^='/app/saas/']:not([href$='/new'])").first(); await link.waitFor({ timeout: 30000 });
const id = (await link.getAttribute("href")).split("/").pop();
console.log("project", projectUrl, id);

// Fill the rich profile through the settings form.
await d.goto(`${base}/app/saas/${id}#settings`, { waitUntil: "networkidle" });
await d.waitForSelector("#valueProposition", { timeout: 30000 });
await d.locator("#settings").scrollIntoViewIfNeeded();
// Markets, tech stack and marketing channels are searchable dropdowns: open, type, click the match.
const rx = (s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const pick = async (testId, label, items, custom) => {
  const box = d.locator(`[data-testid=${testId}]`);
  await box.scrollIntoViewIfNeeded();
  await box.locator("button[aria-haspopup=listbox]").click();
  const search = d.locator(`input[aria-label='Search ${label}']`);
  for (const t of items) { await search.fill(t); await d.waitForTimeout(150); await box.locator("[role=option]", { hasText: rx(t) }).first().click(); }
  if (custom) { await search.fill(custom); await d.waitForTimeout(150); await box.locator("button", { hasText: /as free text/ }).click(); }
  await d.keyboard.press("Escape");
};
await pick("markets-select", "Markets", ["Analytics", "Developer tools", "AI"]);
await pick("stack-select", "Tech stack", ["Next.js", "Convex", "TypeScript", "Tailwind CSS", "Vercel", "Stripe", "Resend", "PostHog"], "Own event bus");
await pick("channels-select", "Marketing channels", ["SEO", "X", "Product Hunt", "Newsletter"]);
await d.click("#settings button:has-text('Add cofounder')");
await d.fill("#cofounder-name-0", "Grace Hopper"); await d.fill("#cofounder-x-0", "@gracehopper"); await d.fill("#cofounder-github-0", "gracehopper");
await d.selectOption("#country", "DE"); await d.click("#settings button:has-text('Bootstrapped')"); await d.selectOption("#teamSize", "2-5"); await d.fill("#foundedAt", "2024-03");
await d.fill("#valueProposition", "See which SaaS products are actually growing — verified user counts, not screenshots.");
await d.fill("#problemSolved", "Founders compare themselves against vanity numbers. Public growth data was scattered, self-reported and easy to fake.");
await d.fill("#audience", "Indie SaaS founders, bootstrappers and small product teams.");
await d.fill("#pricingSummary", "Free public page; Pro per workspace for private analytics and API access.");
await d.fill("#additionalInfo", "Open JSON / CSV datasets under CC BY 4.0. MCP server for agents.");
await d.fill("#slug", slug);
await d.locator("#settings button[type=submit]").click(); await d.waitForSelector("text=Saved", { timeout: 30000 });
for (const w of [375, 768, 1440]) {
  const p = await page(w);
  await p.goto(`${base}/app/saas/${id}#settings`, { waitUntil: "networkidle" });
  await p.waitForSelector("#valueProposition", { timeout: 30000 });
  await p.locator("#settings").scrollIntoViewIfNeeded();
  await p.locator("#settings").screenshot({ path: `${out}/form-${w}.png` }); console.log("✓", `form-${w}`);
  await p.close();
}
for (const w of [375, 1440]) {
  const p = await page(w);
  await p.goto(`${base}/s/${slug}`, { waitUntil: "networkidle" }); await shot(p, `public-${w}`, true);
  // The fixture is self-reported, so show every source (the default "Verified" filter would hide it).
  await p.goto(`${base}/stacks/nextjs?all=1`, { waitUntil: "networkidle" }); await shot(p, `stacks-nextjs-${w}`, w === 375);
  await p.close();
}
const l = await page(1440);
await l.goto(`${base}/discover?stack=convex`, { waitUntil: "networkidle" }); await shot(l, "discover-stack-1440");
await l.close();
// Production hashes the OG route (/opengraph-image-<hash>); read it from the page and fetch the PNGs directly.
const og = async (name) => { const html = await (await fetch(`${base}/s/${slug}`)).text(); const path = html.match(new RegExp(`/s/${slug}/opengraph-image-[a-z0-9]+`))?.[0]; if (path) writeFileSync(`${out}/${name}.png`, Buffer.from(await (await fetch(`${base}${path}`)).arrayBuffer())); console.log("✓", name, path); };
await og("og");
// Anonymous mode + hide from Google, then the same public surfaces.
await d.goto(`${base}/app/saas/${id}#settings`, { waitUntil: "networkidle" }); await d.waitForSelector("[data-testid=anonymous]", { timeout: 30000 });
await d.locator("[data-testid=anonymous]").click(); await d.locator("[data-testid=hide-from-search]").click();
await d.locator("#settings button[type=submit]").click(); await d.waitForSelector("text=Saved", { timeout: 30000 });
await d.locator("#settings").scrollIntoViewIfNeeded(); await d.locator("#settings").screenshot({ path: `${out}/form-anonymous-1440.png` });
for (const w of [375, 1440]) {
  const p = await page(w);
  await p.goto(`${base}/s/${slug}`, { waitUntil: "networkidle" }); await shot(p, `public-anonymous-${w}`, true);
  if (w === 1440) {
    const robots = await p.locator("meta[name=robots]").getAttribute("content").catch(() => null); console.log("robots:", robots);
    await og("og-anonymous");
    writeFileSync(`${out}/share-card-anonymous.png`, Buffer.from(await (await fetch(`${base}/s/${slug}/share/users/card`)).arrayBuffer())); console.log("✓ share-card-anonymous");
  }
  await p.close();
}
const sm = await (await fetch(`${base}/sitemap.xml`)).text();
console.log("sitemap has hidden slug:", sm.includes(`/s/${slug}`), "· stacks/nextjs:", sm.includes("/stacks/nextjs"));
await browser.close(); console.log("DONE", email, id, slug);
