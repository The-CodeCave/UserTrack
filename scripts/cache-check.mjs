// Usage: node scripts/cache-check.mjs [base=http://localhost:3102] [slug] [username]
// Hits every public route twice against a production build and prints Cache-Control + x-nextjs-cache.
// ISR routes must serve the second request from the route cache (HIT, or STALE while it revalidates); routes with search params render per request but must still carry the
// public Cache-Control so a CDN caches them per URL. Signed-in routes must never carry it.
const [base = "http://localhost:3102", slug = "demo-pixelpost", username = ""] = process.argv.slice(2);

const ISR = ["/", "/categories", "/rankings", "/sitemap.xml", `/s/${slug}`, ...(username ? [`/u/${username}`] : [])];
const PER_URL = ["/leaderboard", "/leaderboard?board=trending&window=24h", "/trending", "/discover", "/hidden-gems", "/stacks/nextjs", "/categories/ai"];
const PRIVATE = ["/sign-in", "/api/account/export"];

const head = async (path) => {
  const res = await fetch(`${base}${path}`, { method: "GET", redirect: "manual" });
  await res.arrayBuffer();
  return { status: res.status, cache: res.headers.get("x-nextjs-cache") ?? "-", control: res.headers.get("cache-control") ?? "-" };
};

let failures = 0;
const check = (ok, line) => { if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"} ${line}`); };

for (const path of ISR) {
  const first = await head(path);
  const second = await head(path);
  check(["HIT", "STALE"].includes(second.cache) && second.control.includes("s-maxage=300"), `${path} → ${first.cache}/${second.cache} · ${second.control}`);
}
for (const path of PER_URL) {
  const res = await head(path);
  check(res.control.includes("public, s-maxage=300"), `${path} → ${res.control}`);
}
for (const path of PRIVATE) {
  const res = await head(path);
  check(!res.control.includes("public, s-maxage=300"), `${path} → ${res.control}`);
}
console.log(failures ? `\n${failures} failing route(s)` : "\nall routes cached as expected");
process.exit(failures ? 1 : 0);
