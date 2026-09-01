// Downloads the og:image of each page path to /tmp/ut-shots/og-<name>.png
import { writeFile } from "node:fs/promises";
const base = process.argv[2] ?? "http://localhost:3000";
const pages = { "og-saas": "/s/demo-pixelpost", "og-profile": "/u/demo", "og-lb": "/leaderboard" };
for (const [name, path] of Object.entries(pages)) {
  const html = await fetch(base + path).then((r) => r.text());
  const url = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  if (!url) { console.log(name, "no og:image"); continue; }
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(`/tmp/ut-shots/${name}.png`, buf);
  console.log(name, res.status, res.headers.get("content-type"), buf.length, url);
}
