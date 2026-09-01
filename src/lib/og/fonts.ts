import { readFile } from "node:fs/promises";
import path from "node:path";

// Vendored Geist woff files (public/fonts) so OG rendering never depends on the network.
const font = (file: string) => readFile(path.join(process.cwd(), "public", "fonts", file));

export async function ogFonts() {
  const [sans, mono] = await Promise.all([font("Geist-SemiBold.woff"), font("GeistMono-Medium.woff")]);
  return [
    { name: "Geist", data: sans, weight: 600 as const, style: "normal" as const },
    { name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}
