/**
 * Legt vast wat Klaro uit de logboeken leert (data/geleerd.json), zodat het blijft als het NextDNS-logboek wordt leeggemaakt.
 * Alleen aanvullen en de datum "laatst gezien" bijwerken; oude punten vallen pas na 90 dagen zonder bevestiging weg.
 * Gebruik: node --experimental-strip-types scripts/leer.ts overzicht.json   (overzicht van scripts/overzicht.ts)
 * Persoonlijke subdomeinen van hostingdiensten (bijv. eigen-naam.vercel.app) worden niet vastgelegd.
 */
import fs from "node:fs";
import { geleerdFile, GELEERD_DAGEN, type Geleerd } from "../lib/geleerd.ts";

const GELEERD = geleerdFile();
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!d.learned) throw new Error("Geen 'learned' in het overzicht: gebruik het volledige overzicht (scripts/overzicht.ts).");
const day = new Date(d.insights?.until || Date.now()).toISOString().slice(0, 10);
const PERSONAL = /\.(vercel\.app|netlify\.app|github\.io|pages\.dev|web\.app|firebaseapp\.com|herokuapp\.com|onrender\.com|glitch\.me|wixsite\.com|blogspot\.com|wordpress\.com|framer\.website|webflow\.io|carrd\.co)$/;
const merge = (old: Geleerd[], now: string[]) => {
  const m = new Map(old.map((x) => [x.k, x.laatst]));
  let added = 0;
  for (const k of now) { if (PERSONAL.test(k) || /\.lan$|\.local$|\.home$/.test(k)) continue; if (!m.has(k)) added++; m.set(k, day); }
  const cutoff = Date.parse(day) - GELEERD_DAGEN * 86_400_000;
  const out = [...m].filter(([, l]) => Date.parse(l) >= cutoff).map(([k, laatst]) => ({ k, laatst })).sort((a, b) => a.k.localeCompare(b.k));
  return { out, added, removed: old.length + added - out.length };
};
const a = merge(GELEERD.auto, d.learned.auto ?? []);
const h = merge(GELEERD.helpers, d.learned.helpers ?? []);
const f = merge(GELEERD.followers ?? [], d.learned.followers ?? []);
const fg = merge(GELEERD.fg ?? [], d.learned.fg ?? []);
fs.writeFileSync("data/geleerd.json", JSON.stringify({ auto: a.out, helpers: h.out, followers: f.out, fg: fg.out }, null, 1) + "\n");
console.log(`Geleerd vastgelegd (${day}): widgets/tabbladen ${a.out.length} (+${a.added}, -${a.removed}), vaste hulpjes ${h.out.length} (+${h.added}, -${h.removed}), doorverwijs-adressen ${f.out.length} (+${f.added}, -${f.removed}), bewijs-adressen ${fg.out.length} (+${fg.added}, -${fg.removed}).`);
