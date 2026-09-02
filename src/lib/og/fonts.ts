import { readFile } from "node:fs/promises";
import path from "node:path";

// Vendored Geist files (public/fonts) so OG rendering never depends on the network.
const font = (file: string) => readFile(path.join(process.cwd(), "public", "fonts", file));

let cache: ReturnType<typeof load> | null = null;

async function load() {
  const [regular, semibold, bold, mono] = await Promise.all([
    font("Geist-Regular.ttf"),
    font("Geist-SemiBold.woff"),
    font("Geist-Bold.ttf"),
    font("GeistMono-Medium.woff"),
  ]);
  return [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: semibold, weight: 600 as const, style: "normal" as const },
    { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}

export function ogFonts() {
  cache ??= load();
  return cache;
}
