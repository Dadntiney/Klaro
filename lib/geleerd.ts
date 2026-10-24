/**
 * Wat Klaro uit de geschiedenis heeft geleerd, vastgelegd zodat het niet verloren gaat als het NextDNS-logboek wordt leeggemaakt.
 * Wordt elke dag aangevuld door scripts/leer.ts. Elk punt onthoudt wanneer het voor het laatst in de logboeken gezien is en geldt
 * tot 90 dagen daarna (genoeg om na het legen van het logboek weer op te bouwen; wat echt verandert, valt vanzelf weg).
 * Alleen labels van Klaro (iPhone, iPad, ...), nooit echte apparaatnamen.
 */
export interface Geleerd { k: string; laatst: string } // laatst: dag (JJJJ-MM-DD) waarop het nog uit de logboeken bleek

export const GELEERD_DAGEN = 90;

export type GeleerdData = {
  /** apparaat|site die zichzelf ververst (widget, open tabblad): losse opvragingen zijn geen bezoek */
  auto: Geleerd[];
  /** sites die altijd met een hulpadres van een andere site meekomen (script van een websitebouwer) */
  helpers: Geleerd[];
  /** apparaat|cloud-adres|site: doorverwijs-adres van een app (zie followers() in lib/companion.ts) */
  followers: Geleerd[];
  /** site|adres: zelf geleerd bewijs dat een app echt open is (zie lib/selflearn.ts) */
  fg?: Geleerd[];
};

/**
 * De gegevens zelf staan in data/geleerd.json, niet in de code: zo komen ze niet in de scripts van de website terecht (die zijn
 * zonder inloggen op te halen). Scripts en tests (Node) lezen het bestand; de pagina vraagt het na inloggen aan de eigen server
 * (api/geleerd.php, zie lib/php-client.ts).
 */
const EMPTY: GeleerdData = { auto: [], helpers: [], followers: [], fg: [] };
let cache: GeleerdData | null = null;
let cacheAt = 0;
let remote: (() => Promise<GeleerdData>) | null = null;

/** In de browser: waar de geleerde gegevens vandaan komen (na inloggen). */
export function setGeleerdSource(fn: () => Promise<GeleerdData>) {
  remote = fn;
  cache = null;
}

/** Node (scripts, tests): het bestand data/geleerd.json. Zonder import bovenaan, zodat dit bestand ook in de browser kan. */
export function geleerdFile(): GeleerdData {
  const p = (globalThis as { process?: { getBuiltinModule?: (m: string) => unknown; cwd?: () => string } }).process;
  const fs = p?.getBuiltinModule?.("node:fs") as typeof import("node:fs") | undefined;
  if (!fs || !p?.cwd) return EMPTY;
  try { return { ...EMPTY, ...JSON.parse(fs.readFileSync(`${p.cwd()}/data/geleerd.json`, "utf8")) }; } catch { return EMPTY; }
}

/** De geleerde gegevens; lukt ophalen niet, dan zonder (Klaro werkt dan zoals voordat er iets geleerd was). */
export async function loadGeleerd(): Promise<GeleerdData> {
  if (!remote) return (cache ??= geleerdFile());
  if (cache && Date.now() - cacheAt < 3_600_000) return cache; // een pagina die dagen openstaat krijgt elk uur het nieuwste
  try { cache = { ...EMPTY, ...(await remote()) }; cacheAt = Date.now(); return cache; } catch { return cache ?? EMPTY; }
}

/** Wat op `now` nog geldt. */
export function geldig(lijst: Geleerd[], now: number): string[] {
  return lijst.filter((x) => now - Date.parse(x.laatst + "T00:00:00Z") <= GELEERD_DAGEN * 86_400_000).map((x) => x.k);
}
