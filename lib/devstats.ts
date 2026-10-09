const HOUR = 3_600_000;

/** 95e percentiel (in ms) van de pauzes tussen opeenvolgende verzoeken overdag; bepaalt wat voor dit apparaat "normaal stil" is. */
export function gapP95(sorted: number[], hourOf: (t: number) => number): number {
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    const h = hourOf(sorted[i - 1]);
    if (g >= 60_000 && g <= 6 * HOUR && h >= 7 && h <= 21) gaps.push(g);
  }
  if (gaps.length < 20) return 2 * HOUR; // te weinig gegevens: ruime standaard
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length * 0.95)];
}

/** Is het apparaat ongewoon lang stil? Alleen overdag, en alleen als het eerder duidelijk actief was. */
export function isSilent(now: number, last: number, p95: number, hour: number, activeDays: number): { silent: boolean; since: number } {
  const since = now - last;
  const limit = Math.max(90 * 60_000, 4 * p95);
  return { silent: activeDays >= 3 && hour >= 8 && hour <= 23 && since > limit, since };
}
