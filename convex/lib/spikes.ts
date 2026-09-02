// A day counts as a spike when it is ≥ 3× the trailing 14-day average and at least `minAbs` absolute.
export function detectSpike(history: number[], today: number, minAbs = 20, multiple = 3) {
  const window = history.slice(-14).filter((n) => Number.isFinite(n));
  if (window.length < 5) return null;
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  if (today < minAbs || avg <= 0) return null;
  const x = today / avg;
  return x >= multiple ? { multiple: Math.round(x * 10) / 10, average: Math.round(avg) } : null;
}
