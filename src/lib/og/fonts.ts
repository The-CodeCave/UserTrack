// Loads a Google Font subset as TTF for next/og. Falls back to the built-in font when offline.
export async function loadGoogleFont(family: string, weight: number, text: string) {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0" },
    }).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function ogFonts(text: string) {
  const [sans, mono] = await Promise.all([loadGoogleFont("Geist", 600, text), loadGoogleFont("Geist Mono", 500, text)]);
  const fonts = [];
  if (sans) fonts.push({ name: "Geist", data: sans, weight: 600 as const, style: "normal" as const });
  if (mono) fonts.push({ name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const });
  return fonts;
}
