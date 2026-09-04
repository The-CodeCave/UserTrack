// Renders public/og.png (1200x630) from an inline HTML template using the local Chrome.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const mono = readFileSync("public/brand/monogram.png").toString("base64");
const font = readFileSync("public/fonts/Geist-Bold.ttf").toString("base64");
const html = `<!doctype html><html><head><style>
@font-face{font-family:G;src:url(data:font/ttf;base64,${font})}
body{margin:0;width:1200px;height:630px;background:#0b0c0e;color:#f4f4f5;font-family:G,sans-serif;position:relative;overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(to right,rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.05) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 0%,#000 20%,transparent 100%)}
.in{position:absolute;inset:0;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;align-items:center;gap:18px;font-size:30px}
.top img{width:56px;height:56px}
h1{font-size:76px;line-height:1.02;letter-spacing:-.03em;margin:0;max-width:980px}
h1 span{color:#fb0184}
p{font-size:28px;color:#8b8f98;margin:22px 0 0;max-width:900px;line-height:1.35}
.bot{display:flex;justify-content:space-between;align-items:flex-end;font-size:20px;color:#8b8f98;letter-spacing:.12em;text-transform:uppercase}
.btn{background:#fb0184;color:#fff;padding:16px 28px;font-size:24px;letter-spacing:0;text-transform:none;box-shadow:0 0 32px rgba(251,1,132,.4)}
</style></head><body><div class="grid"></div><div class="in">
<div class="top"><img src="data:image/png;base64,${mono}"><b>UserTrack</b></div>
<div><h1>See which SaaS are <span>actually</span> growing.</h1><p>Verified user growth pulled read-only from Clerk, Supabase, Stripe &amp; co. Never typed in.</p></div>
<div class="bot"><span>usertrack.dev · coming soon</span><span class="btn">Join the waitlist →</span></div>
</div></body></html>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: "public/og.png" });
await browser.close();
console.log("saved public/og.png");
