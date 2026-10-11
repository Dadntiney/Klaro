import type { Session } from "./sessions.ts";

/** Aantal regels per apparaat + site in de lijst van vandaag. */
export function rowCounts(rows: { g: { dev: string; site: string }; ss: Session[] }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) { const k = r.g.dev + "|" + r.g.site; m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

/**
 * Geluid alleen bij een nieuwe regel in de lijst (nieuwe app, site of game, of een nieuw bezoek aan dezelfde),
 * niet bij elke opvraging van iets dat al in beeld staat. Alleen als die regel nu bezig is (laatste activiteit
 * < 3 min): een regel die pas later verschijnt (na het opnieuw berekenen) gaat over iets van eerder.
 */
export function hasNewRow(prev: Map<string, number>, rows: { g: { dev: string; site: string }; ss: Session[] }[], now: number): boolean {
  const cur = rowCounts(rows);
  return rows.some((r) => {
    const k = r.g.dev + "|" + r.g.site;
    return (cur.get(k) ?? 0) > (prev.get(k) ?? 0) && now - Math.max(...r.ss.map((x) => x.e)) < 180_000;
  });
}
