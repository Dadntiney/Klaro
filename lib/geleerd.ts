/**
 * Wat Klaro uit de geschiedenis heeft geleerd, vastgelegd zodat het niet verloren gaat als het NextDNS-logboek wordt leeggemaakt.
 * Wordt elke dag aangevuld door scripts/leer.ts. Elk punt onthoudt wanneer het voor het laatst in de logboeken gezien is en geldt
 * tot 90 dagen daarna (genoeg om na het legen van het logboek weer op te bouwen; wat echt verandert, valt vanzelf weg).
 * Alleen labels van Klaro (iPhone, iPad, ...), nooit echte apparaatnamen.
 */
export interface Geleerd { k: string; laatst: string } // laatst: dag (JJJJ-MM-DD) waarop het nog uit de logboeken bleek

export const GELEERD_DAGEN = 90;

export const GELEERD: {
  /** apparaat|site die zichzelf ververst (widget, open tabblad): losse opvragingen zijn geen bezoek */
  auto: Geleerd[];
  /** sites die altijd met een hulpadres van een andere site meekomen (script van een websitebouwer) */
  helpers: Geleerd[];
} = {
  auto: [
    { k: "Apple TV|google.com", laatst: "2026-10-16" },
    { k: "iPhone|google.com", laatst: "2026-10-16" },
    { k: "iPhone|onsoranje26.nl", laatst: "2026-10-16" },
    { k: "iPhone|voetbalkrant.com", laatst: "2026-10-16" },
    { k: "MacBook|canva.com", laatst: "2026-10-16" },
  ],
  helpers: [
    { k: "clouding17.com", laatst: "2026-10-16" },
    { k: "sugar-b.com", laatst: "2026-10-16" },
  ],
};

/** Wat op `now` nog geldt. */
export function geldig(lijst: Geleerd[], now: number): string[] {
  return lijst.filter((x) => now - Date.parse(x.laatst + "T00:00:00Z") <= GELEERD_DAGEN * 86_400_000).map((x) => x.k);
}
