/**
 * Referentiegevallen: situaties die de eigenaar zelf heeft gecontroleerd (11 okt 2026). Na elke wijziging draaien op het
 * overzicht van /api/nextdns: alles moet nog kloppen, anders niet live laten staan.
 * Gebruik: node --experimental-strip-types scripts/referentie.ts overzicht.json
 */
import fs from "node:fs";
import { isHuman } from "../lib/sessions.ts";

type Case = { day: string; dev: string; site: string; at: string; want: boolean | "onzeker"; why: string };
const CASES: Case[] = [
  { day: "2026-10-11", dev: "iPhone", site: "praxis.nl", at: "10:27", want: true, why: "website geopend na zoeken" },
  { day: "2026-10-11", dev: "iPhone", site: "decathlon.nl", at: "10:16", want: true, why: "inloggen na zoeken" },
  { day: "2026-10-11", dev: "iPhone", site: "rabobank.nl", at: "10:28", want: true, why: "bank-app" },
  { day: "2026-10-11", dev: "iPhone", site: "nu.nl", at: "10:53", want: true, why: "artikel via X" },
  { day: "2026-10-11", dev: "iPhone", site: "inspirerendleven.nl", at: "09:33", want: true, why: "klik in nieuwsbrief" },
  { day: "2026-10-11", dev: "iPhone", site: "marktplaats.nl", at: "09:14", want: true, why: "app geopend" },
  { day: "2026-10-11", dev: "iPhone", site: "nespresso.com", at: "10:47", want: false, why: "plaatje in nieuwsbrief" },
  { day: "2026-10-11", dev: "iPhone", site: "jobescape.me", at: "11:00", want: "onzeker", why: "advertentie in X (of toch geopend)" },
  { day: "2026-10-11", dev: "iPhone", site: "wwiqtest.com", at: "10:53", want: "onzeker", why: "advertentie in X (of toch geopend)" },
  { day: "2026-10-11", dev: "iPhone", site: "ift.tt", at: "10:53", want: false, why: "doorstuur-link" },
  { day: "2026-10-11", dev: "iPhone", site: "dpgmedia.nl", at: "10:53", want: false, why: "inlog/privacy achter nu.nl" },
  { day: "2026-10-11", dev: "iPhone", site: "voetbalkrant.com", at: "*", want: false, why: "widget ververst zichzelf" },
  { day: "2026-10-11", dev: "iPhone", site: "onsoranje26.nl", at: "*", want: false, why: "widget ververst zichzelf" },
  { day: "2026-10-08", dev: "Apple TV", site: "youtube.com", at: "00:16", want: true, why: "YouTube-app (kanaalplaatjes), alleen video daarna" },
  { day: "2026-10-11", dev: "iPhone", site: "youtube.com", at: "18:28", want: false, why: "videoclip in Shazam, YouTube niet geopend" },
  { day: "2026-10-11", dev: "iPad", site: "minecraft.net", at: "16:42", want: true, why: "Minecraft gespeeld (meetgegevens tijdens het spel)" },
  { day: "2026-10-11", dev: "iPhone", site: "whatsapp.com", at: "14:06", want: true, why: "app geopend, bericht verstuurd" },
  { day: "2026-10-10", dev: "iPhone", site: "werkenbijseverinus.nl", at: "12:36", want: true, why: "vacature geopend" },
  { day: "2026-10-08", dev: "MacBook", site: "msn.com", at: "15:06", want: false, why: "nieuw tabblad Edge" },
];
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const auto = new Set<string>(d.auto ?? []);
const hm = (t: number) => new Date(t).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
let bad = 0;
for (const c of CASES) {
  const gs = d.groups.filter((g: any) => g.d === c.day && g.dev === c.dev && g.site === c.site && !g.bg && g.main);
  const visS = gs.flatMap((g: any) => (g.ss ?? []).filter((x: any) => isHuman(x) && !(x.pv && !x.lg && auto.has(g.dev + "|" + g.site))));
  const vis = visS.map((x: any) => hm(x.s));
  const got = c.at === "*" ? vis.length > 0 : vis.includes(c.at);
  const unsure = visS.some((x: any) => (c.at === "*" || hm(x.s) === c.at) && x.uz);
  const ok = c.want === "onzeker" ? got && unsure : got === c.want && !(c.want && unsure);
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${c.day} ${c.at} ${c.site} → ${c.want === "onzeker" ? "tonen als onzeker" : c.want ? "tonen" : "niet tonen"} (${c.why})${ok ? "" : `  [nu: ${got ? (unsure ? "getoond als onzeker" : "getoond") : "niet getoond"}]`}`);
}
console.log(bad ? `\n${bad} referentiegeval(len) kloppen niet.` : "\nAlle referentiegevallen kloppen.");
process.exit(bad ? 1 : 0);
