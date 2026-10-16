/**
 * Domeinlijsten:
 *  - adult: "Porn Block List" van The Block List Project (MIT, https://github.com/blocklistproject/Lists), ~937.000 adressen
 *  - dating: "dating" van UT1 / Université Toulouse Capitole (CC BY-SA 4.0, https://dsi.ut-capitole.fr/blacklists/), ~10.500 adressen
 * Beide samengevoegd tot de kortste vorm (kinderen weg als het ouderdomein al op de lijst staat).
 *
 * Op de server (Node: tests, scripts) worden de lijsten uit data/ gelezen. In de browser zijn ze te groot: daar vraagt
 * `prepareLists` vooraf aan de eigen server (api/lists.php) welke adressen op een lijst staan, en onthoudt dat.
 */
type ListName = "adult" | "dating";

const cache = new Map<string, Set<string>>();

function loadNode(name: ListName): Set<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  let set = new Set<string>();
  try {
    // Zonder import bovenaan: dan blijft dit bestand ook in de browser bruikbaar.
    const p = (globalThis as { process?: { getBuiltinModule?: (m: string) => unknown; cwd?: () => string } }).process;
    const fs = p?.getBuiltinModule?.("node:fs") as typeof import("node:fs") | undefined;
    const zlib = p?.getBuiltinModule?.("node:zlib") as typeof import("node:zlib") | undefined;
    if (fs && zlib && p?.cwd) set = new Set(zlib.gunzipSync(fs.readFileSync(`${p.cwd()}/data/${name}-domains.txt.gz`)).toString("utf8").split("\n"));
  } catch (e) {
    console.error(`${name}-domains.txt.gz niet gevonden; alleen trefwoorden gebruikt`, e);
  }
  cache.set(name, set);
  return set;
}

/** Alle kandidaten voor een adres: het adres zelf en elk bovenliggend domein (cdn.example.com → example.com). */
export function listCandidates(host: string): string[] {
  const parts = host.split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

// Browser: per lijst de kandidaten die er (volgens de server) op staan, en alle adressen die al nagevraagd zijn.
const remote = { adult: new Set<string>(), dating: new Set<string>(), asked: new Set<string>() };
let remoteLookup: ((hosts: string[]) => Promise<{ adult: string[]; dating: string[] }>) | null = null;

/** In de browser: hoe de lijsten op afstand worden nagevraagd. */
export function setRemoteLists(lookup: (hosts: string[]) => Promise<{ adult: string[]; dating: string[] }>) {
  remoteLookup = lookup;
}

/** Vóór het beoordelen van adressen (alleen nodig in de browser): nog onbekende adressen navragen. */
export async function prepareLists(hosts: Iterable<string>): Promise<void> {
  if (!remoteLookup) return;
  const todo = [...new Set(hosts)].filter((h) => h && !remote.asked.has(h));
  for (let i = 0; i < todo.length; i += 4000) {
    const part = todo.slice(i, i + 4000);
    const r = await remoteLookup(part);
    for (const c of r.adult) remote.adult.add(c);
    for (const c of r.dating) remote.dating.add(c);
    for (const h of part) remote.asked.add(h);
  }
}

/** Staat het adres (of een bovenliggend domein, zoals example.com voor cdn.example.com) op de lijst? */
function inList(name: ListName, host: string): boolean {
  const set = remoteLookup ? remote[name] : loadNode(name);
  return listCandidates(host).some((c) => set.has(c));
}

export const inAdultList = (host: string) => inList("adult", host);
export const inDatingList = (host: string) => inList("dating", host);
