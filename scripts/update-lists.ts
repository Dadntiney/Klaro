// Werkt de 18+- en datinglijsten in data/ bij met de nieuwste versies van de bronlijsten (zie data/README.md).
// Alleen toevoegen, nooit weghalen (lib/lijsten.ts). Elke bron tot 3 keer proberen; lukt een bron niet, dan gaan de andere
// gewoon door en eindigt het script met een fout (zodat GitHub het registreert en meldt). Elke wijziging komt met datum, bron
// en aantallen in data/wijzigingen.md, zodat alles controleerbaar en via git terug te draaien is.
// Gebruik: node --experimental-strip-types scripts/update-lists.ts   (dagelijks via .github/workflows/update-lists.yml)
import fs from "node:fs";
import zlib from "node:zlib";
import { mergeLists, parseList } from "../lib/lijsten.ts";

const ADULT = [
  "https://raw.githubusercontent.com/blocklistproject/Lists/master/alt-version/porn-nl.txt",
  "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/nsfw-onlydomains.txt",
  "https://raw.githubusercontent.com/Sinfonietta/hostfiles/master/pornography-hosts",
  "https://raw.githubusercontent.com/StevenBlack/hosts/master/extensions/porn/clefspeare13/hosts",
];
const DATING = ["https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/dating/domains"];

async function fetchList(u: string, minSize: number): Promise<Set<string>> {
  let last = "";
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const got = parseList(await res.text());
      if (got.size < minSize) throw new Error(`verdacht klein (${got.size})`);
      return got;
    } catch (e) {
      last = String((e as Error).message ?? e);
      console.log(`${u}: poging ${i} mislukt (${last})`);
      await new Promise((r) => setTimeout(r, 5_000 * i));
    }
  }
  throw new Error(last);
}

const log: string[] = [];
const day = new Date().toISOString().slice(0, 10);
let failed = 0;
async function update(name: string, urls: string[]) {
  const file = `data/${name}-domains.txt.gz`;
  const old = new Set(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8").split("\n").filter(Boolean));
  const sources: Set<string>[] = [];
  const per: string[] = [];
  for (const u of urls) {
    try { const s = await fetchList(u, 1000); sources.push(s); per.push(`${u.split("/").slice(3, 5).join("/")}: ${s.size}`); }
    catch (e) { failed++; per.push(`${u.split("/").slice(3, 5).join("/")}: MISLUKT (${(e as Error).message})`); }
  }
  const { next, added } = mergeLists(old, sources);
  console.log(`${file}: was ${old.size}, nu ${next.size} (+${added.length})`);
  if (added.length) fs.writeFileSync(file, zlib.gzipSync([...next].sort().join("\n") + "\n", { level: 9 }));
  log.push(`- ${name}: ${old.size} → ${next.size} (+${added.length}). Bronnen: ${per.join("; ")}.` + (added.length ? ` Voorbeelden erbij: ${added.slice(0, 5).join(", ")}${added.length > 5 ? ", ..." : ""}` : ""));
}

await update("adult", ADULT);
await update("dating", DATING);
const changed = log.some((l) => !/\(\+0\)/.test(l));
if (changed || failed) {
  const f = "data/wijzigingen.md";
  const head = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "# Wijzigingen in de 18+- en datinglijsten\n\nAutomatisch bijgehouden door scripts/update-lists.ts (nieuwste bovenaan). Terugdraaien: git revert van die commit.\n";
  const [title, intro, ...rest] = head.split(/\n\n+/).map((x) => x.trim());
  fs.writeFileSync(f, [title, intro, `## ${day}\n${log.join("\n")}`, ...rest].filter(Boolean).join("\n\n") + "\n");
}
if (failed) { console.error(`${failed} bron(nen) mislukt na 3 pogingen.`); process.exit(2); }
