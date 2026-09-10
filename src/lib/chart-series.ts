export function activationDeltaAt(points: readonly { activated?: number }[], index: number) {
  const current = points[index]?.activated;
  const previous = points[index - 1]?.activated;
  return current === undefined || previous === undefined ? null : current - previous;
}
