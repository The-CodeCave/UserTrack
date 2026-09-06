import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
// SHIP-1 launch pass. Usage: pnpm build && PORT=3100 pnpm start, then BASE=http://localhost:3100 node scripts/shots-ship1.mjs [public|unverified|founder|all]
// The dev deployment's SITE_URL must match that port (`npx convex env set SITE_URL http://localhost:3100`) or Better Auth answers 403 (A208).
const base = process.env.BASE ?? "http://localhost:3100", out = "docs/screenshots/v1/ship";
const phase = process.argv[2] ?? "all";
const WIDTHS = [375, 768, 1440];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ deviceScaleFactor: 2, colorScheme: "dark" });
const page = async (w) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: w < 768 ? 812 : 900 }); return p; };
const shot = async (p, name) => { await p.waitForTimeout(1600); await p.screenshot({ path: `${out}/${name}.png`, fullPage: true }); console.log("✓", name); };
process.on("unhandledRejection", async (e) => { console.error(e); for (const p of ctx.pages()) await p.screenshot({ path: `/tmp/ut-ship-fail-${ctx.pages().indexOf(p)}.png` }).catch(() => {}); process.exit(1); });

const onboard = async (d, tag, product) => {
  await d.waitForSelector("#displayName", { timeout: 30000 });
  await d.fill("#username", tag); await d.fill("#x", "adalovelace"); await d.click("button[type=submit]");
  await d.click("text=Connect manually", { timeout: 30000 }); await d.waitForSelector("#name", { timeout: 30000 });
  await d.fill("#name", product.name); await d.fill("#websiteUrl", product.site); await d.fill("#description", product.description); await d.selectOption("#category", product.category);
  await d.click("button[type=submit]"); await d.waitForSelector("text=What are you tracking?", { timeout: 30000 });
  await d.locator("button", { hasText: /web/i }).first().click(); await d.click("button:has-text('Continue')"); await d.waitForTimeout(900);
  for (let i = 0; i < 8 && !(await d.locator("text=Connect a data source").count()); i++) {
    const opt = d.locator("button[aria-pressed=false]");
    if (await opt.count()) { await opt.first().click(); await d.waitForTimeout(300); }
    await d.click("button:has-text('Continue'):enabled, button:has-text('Show recommendations'):enabled"); await d.waitForTimeout(900);
  }
  await d.waitForSelector("text=Connect a data source", { timeout: 30000 }); await d.click("text=Manual"); await d.fill("#totalUsers", "8420"); await d.click("button[type=submit]");
  for (let i = 0; i < 6 && !(await d.locator("text=Publish page").count()); i++) {
    const skip = d.locator("text=Skip for now");
    if (await skip.count()) await skip.first().click();
    await d.waitForTimeout(900);
  }
  await d.click("text=Publish page"); await d.waitForSelector("text=on the board", { timeout: 30000 });
};

if (phase === "public" || phase === "all") {
  const PAGES = [["landing", "/"], ["leaderboard", "/leaderboard"], ["discover", "/discover"], ["project-demo", "/s/demo-northwind"], ["impressum", "/impressum"], ["privacy", "/privacy"], ["terms", "/terms"], ["developers", "/developers"], ["sign-up", "/sign-up"], ["sign-in", "/sign-in"], ["health", "/api/health?deep=1"]];
  for (const w of WIDTHS) {
    const p = await page(w);
    for (const [name, path] of PAGES) { await p.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 }); await shot(p, `${name}-${w}`); }
    await p.close();
  }
}

if (phase === "unverified" || phase === "all") {
  // The unverified sign-in state needs a fresh password account that never clicked the mail link.
  const tag = Date.now().toString(36), email = `ship-unverified-${tag}@example.com`;
  for (const w of WIDTHS) {
    const p = await page(w);
    if (w === WIDTHS[0]) {
      await p.goto(`${base}/sign-up`, { waitUntil: "domcontentloaded" });
      await p.fill("#name", "Ship Unverified"); await p.fill("#email", email); await p.fill("#password", "supersecret123");
      await p.click("button[type=submit]"); await p.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
      await shot(p, `sign-up-check-inbox-${w}`);
    }
    await p.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded" });
    await p.fill("#email", email); await p.fill("#password", "supersecret123"); await p.click("button[type=submit]");
    await p.waitForSelector("[data-testid=unverified]", { timeout: 30000 });
    await shot(p, `sign-in-unverified-${w}`);
    await p.close();
  }
}

if (phase === "founder" || phase === "all") {
  const tag = `ship-${Date.now().toString(36)}`, email = `${tag}@example.com`, slug = `${tag}-app`;
  const d = await page(1440);
  await d.goto(`${base}/sign-up`, { waitUntil: "domcontentloaded" });
  await d.fill("#name", "Ship Founder"); await d.fill("#email", email); await d.fill("#password", "supersecret123");
  await d.click("button[type=submit]"); await d.waitForSelector("[data-testid=check-inbox]", { timeout: 30000 });
  const where = JSON.stringify({ input: { model: "user", where: [{ field: "email", operator: "eq", value: email }], update: { emailVerified: true } } });
  execSync(`npx convex run --component betterAuth adapter:updateOne '${where}'`, { stdio: "inherit" });
  await d.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded" });
  await d.fill("#email", email); await d.fill("#password", "supersecret123"); await d.click("button[type=submit]");
  await d.waitForURL("**/app/onboarding", { timeout: 30000 });
  // The onboarding profile step is the only screen that disappears once onboarding is done — capture it before walking through.
  for (const w of WIDTHS) {
    const p = await page(w);
    await p.goto(`${base}/app/onboarding`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("#displayName", { timeout: 30000 }); await shot(p, `onboarding-profile-${w}`);
    await p.close();
  }
  await onboard(d, tag, { name: "Stackpilot", site: "https://stackpilot.example.com", description: "Growth analytics for indie SaaS teams who ship weekly.", category: "analytics" });
  await d.goto(`${base}/app`, { waitUntil: "domcontentloaded" });
  const link = d.locator("a[href^='/app/saas/']:not([href$='/new'])").first(); await link.waitFor({ timeout: 30000 });
  const id = (await link.getAttribute("href")).split("/").pop();
  console.log("project", id);

  // Rich profile so the public page really has About + Company & stack and /stacks/nextjs is not empty.
  await d.goto(`${base}/app/saas/${id}#settings`, { waitUntil: "domcontentloaded" });
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
  await pick("stack-select", "Tech stack", ["Next.js", "Convex", "TypeScript", "Tailwind CSS", "Stripe", "Resend"]);
  await pick("channels-select", "Marketing channels", ["SEO", "X", "Product Hunt"]);
  await d.click("#settings button:has-text('Add cofounder')");
  await d.fill("#cofounder-name-0", "Grace Hopper"); await d.fill("#cofounder-x-0", "@gracehopper"); await d.fill("#cofounder-github-0", "gracehopper");
  await d.selectOption("#country", "DE"); await d.click("#settings button:has-text('Bootstrapped')"); await d.selectOption("#teamSize", "2-5"); await d.fill("#foundedAt", "2024-03");
  await d.fill("#valueProposition", "See which SaaS products are actually growing — verified user counts, not screenshots.");
  await d.fill("#problemSolved", "Public growth data was scattered, self-reported and easy to fake.");
  await d.fill("#audience", "Indie SaaS founders, bootstrappers and small product teams.");
  await d.fill("#pricingSummary", "Free public page; Pro per workspace for private analytics and API access.");
  await d.fill("#slug", slug);
  await d.locator("#settings button[type=submit]").click(); await d.waitForSelector("text=Saved", { timeout: 30000 });

  for (const w of WIDTHS) {
    const p = await page(w);
    await p.goto(`${base}/s/${slug}`, { waitUntil: "domcontentloaded" }); await shot(p, `project-about-stack-${w}`);
    await p.goto(`${base}/stacks/nextjs?all=1`, { waitUntil: "domcontentloaded" }); await shot(p, `stacks-nextjs-${w}`);
    await p.goto(`${base}/u/${tag}`, { waitUntil: "domcontentloaded" }); await shot(p, `founder-${w}`);
    await p.goto(`${base}/app`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1200); await shot(p, `dashboard-${w}`);
    await p.goto(`${base}/app/saas/${id}#settings`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-testid=trustmrr-open]", { timeout: 30000 });
    await p.locator("[data-testid=trustmrr-import]").scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
    await p.locator("[data-testid=trustmrr-import]").screenshot({ path: `${out}/project-form-trustmrr-${w}.png` }); console.log("✓", `project-form-trustmrr-${w}`);
    await p.goto(`${base}/app/settings`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-testid=connected-accounts]", { timeout: 30000 }); await shot(p, `settings-${w}`);
    await p.locator("#data-privacy").scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    await p.locator("#data-privacy").screenshot({ path: `${out}/settings-data-privacy-${w}.png` }); console.log("✓", `settings-data-privacy-${w}`);
    await p.click("button:has-text('Delete account')"); await p.waitForSelector("#delete-confirm", { timeout: 15000 });
    await p.waitForTimeout(500); await p.screenshot({ path: `${out}/settings-delete-dialog-${w}.png` }); console.log("✓", `settings-delete-dialog-${w}`);
    await p.keyboard.press("Escape");
    await p.goto(`${base}/app/settings/social`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1200); await shot(p, `settings-social-${w}`);
    await p.close();
  }
  // Anonymous mode strips owner, cofounders, logo, website and store links from every public surface.
  // The slug changes with it: `/s/<slug>` is an ISR route (revalidate = 300), so the pre-anonymous HTML would be served
  // from the route cache for another five minutes. A slug that has never been requested renders fresh.
  const anonSlug = `${slug}-anon`;
  await d.goto(`${base}/app/saas/${id}#settings`, { waitUntil: "domcontentloaded" });
  await d.waitForSelector("[data-testid=anonymous]", { timeout: 30000 });
  await d.locator("[data-testid=anonymous]").click();
  await d.fill("#slug", anonSlug);
  await d.locator("#settings button[type=submit]").click(); await d.waitForSelector("text=Saved", { timeout: 30000 });
  for (const w of WIDTHS) {
    const p = await page(w);
    await p.goto(`${base}/s/${anonSlug}`, { waitUntil: "domcontentloaded" }); await shot(p, `project-anonymous-${w}`);
    await p.close();
  }
  const html = await (await fetch(`${base}/s/${anonSlug}`)).text();
  const ogPath = html.match(new RegExp(`/s/${anonSlug}/opengraph-image-[a-z0-9]+`))?.[0];
  if (ogPath) { writeFileSync(`${out}/project-og-anonymous.png`, Buffer.from(await (await fetch(`${base}${ogPath}`)).arrayBuffer())); console.log("✓ project-og-anonymous"); }
  writeFileSync(`${out}/badge-demo-northwind.svg`, await (await fetch(`${base}/api/badge/demo-northwind.svg`)).text()); console.log("✓ badge-demo-northwind.svg");
  console.log("DONE", email, slug, anonSlug, id);
}
await browser.close();
