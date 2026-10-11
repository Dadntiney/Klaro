/**
 * Dagelijkse controle "mogelijk gemist": leest het overzicht van /api/nextdns (JSON-bestand) en toont van de laatste 2 dagen
 * activiteit die op gebruik lijkt (2+ momenten) maar nergens zichtbaar is, met de reden. Zelfde logica als /api/audit (missed).
 * Gebruik: node --experimental-strip-types scripts/gemist.ts overzicht.json
 */
import fs from "node:fs";
import { isHuman, type Session } from "../lib/sessions.ts";
import { isSystemSite } from "../lib/system.ts";

type G = { d: string; dev: string; site: string; main: boolean; bg: boolean; flag?: string; ss?: Session[] };
const ov = JSON.parse(fs.readFileSync(process.argv[2], "utf8")) as { groups: G[]; auto?: string[] };
const days = [...new Set(ov.groups.map((g) => g.d))].sort().slice(-2);
const auto = new Set(ov.auto ?? []);
const why = (g: G, x: Session) =>
  x.ml ? "mail" : x.res ? "alleen onderdelen" : x.emb ? "ingesloten" : auto.has(g.dev + "|" + g.site) ? "ververst zichzelf" : !g.main ? "onbekende app/geen eigen website" : x.f !== undefined ? "app-achtergrond" : "te kort";
const tijd = (t: number) => new Date(t).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const rows = ov.groups
  .filter((g) => days.includes(g.d) && !g.bg && !g.flag && !isSystemSite(g.site) && !(g.ss ?? []).some((x) => isHuman(x)))
  .flatMap((g) => (g.ss ?? []).filter((x) => (x.n ?? 0) >= 2).map((x) => ({ g, x })))
  .sort((a, b) => (b.x.n ?? 0) - (a.x.n ?? 0));
console.log(`Mogelijk gemist (${days.join(", ")}): ${rows.length}`);
for (const { g, x } of rows.slice(0, 80)) console.log(`${tijd(x.s)}  ${g.dev.padEnd(10)} ${g.site.padEnd(28)} ${x.n} momenten, ${Math.round((x.e - x.s) / 1000)} s  → ${why(g, x)}`);
