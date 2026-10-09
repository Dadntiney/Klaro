import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Domeinlijsten, bij het eerste gebruik op de server ingelezen:
 *  - adult: "Porn Block List" van The Block List Project (MIT, https://github.com/blocklistproject/Lists), ~937.000 adressen
 *  - dating: "dating" van UT1 / Université Toulouse Capitole (CC BY-SA 4.0, https://dsi.ut-capitole.fr/blacklists/), ~10.500 adressen
 * Beide samengevoegd tot de kortste vorm (kinderen weg als het ouderdomein al op de lijst staat).
 */
const cache = new Map<string, Set<string>>();

function load(name: string): Set<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  let set: Set<string>;
  try {
    const file = path.join(process.cwd(), "data", `${name}-domains.txt.gz`);
    set = new Set(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8").split("\n"));
  } catch (e) {
    console.error(`${name}-domains.txt.gz niet gevonden; alleen trefwoorden gebruikt`, e);
    set = new Set();
  }
  cache.set(name, set);
  return set;
}

/** Staat het adres (of een bovenliggend domein, zoals example.com voor cdn.example.com) op de lijst? */
function inList(name: string, host: string): boolean {
  const set = load(name);
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export const inAdultList = (host: string) => inList("adult", host);
export const inDatingList = (host: string) => inList("dating", host);
