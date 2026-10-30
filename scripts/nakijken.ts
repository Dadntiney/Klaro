// "Nakijken"-verzoeken van de eigenaar (knop bij een regel in Klaro, api/nakijken.php).
// Gebruik: KLARO_PW=... node --experimental-strip-types scripts/nakijken.ts                 open verzoeken tonen
//          KLARO_PW=... node --experimental-strip-types scripts/nakijken.ts --klaar ID "antwoord"   nagekeken, met antwoord
// Elk verzoek uitzoeken zoals in docs/dagelijkse-controle.md (ruwe regels rond dat moment, over alle dagen; algemene regel,
// doorrekenen, referentiegeval). Het antwoord kort en in eenvoudig Nederlands: klopt het, wat was het, wat is er aangepast.
const site = process.env.KLARO_SITE ?? "https://pichya.nl";
const pw = process.env.KLARO_PW;
if (!pw) throw new Error("KLARO_PW ontbreekt");
const headers = { Authorization: "Basic " + Buffer.from("klaro:" + pw).toString("base64"), "Content-Type": "application/json" };
const i = process.argv.indexOf("--klaar");
if (i > 0) {
  const [id, antwoord] = [process.argv[i + 1], process.argv[i + 2]];
  if (!id || !antwoord) throw new Error('Gebruik: --klaar ID "antwoord"');
  const res = await fetch(`${site}/api/nakijken.php`, { method: "POST", headers, body: JSON.stringify({ done: id, antwoord }) });
  console.log(res.ok ? "Nagekeken: antwoord staat in Klaro." : `Mislukt: ${res.status}`);
  process.exit(res.ok ? 0 : 1);
}
const res = await fetch(`${site}/api/nakijken.php`, { headers });
if (!res.ok) throw new Error(`server ${res.status}`);
const items = ((await res.json()) as { items: { id: string; at: number; d: string; dev: string; site: string; name: string; s: number; e: number; done: number }[] }).items;
const hm = (t: number) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(t);
const open = items.filter((x) => !x.done);
console.log(open.length ? `Open verzoeken (${open.length}):` : "Geen open verzoeken.");
for (const x of open) console.log(`${x.id}  ${x.dev}  ${x.site} (${x.name})  ${hm(x.s)} – ${hm(x.e)}  [gevraagd ${hm(x.at)}]  UTC ${new Date(x.s).toISOString()}`);

// Zelfbewaking (ook elk uur): draaide de waarschuw-taak (elke 5 min) de laatste 20 minuten niet goed, dan dat zeggen, zodat het
// opgelost wordt voordat de eigenaar het ziet. Uitzoeken: Actions → Waarschuwen (draait de keten nog?) en api/alert.php.
const h = await fetch(`${site}/api/push.php`, { headers });
const laatst = h.ok ? ((await h.json()) as { laatst?: number | null }).laatst : null;
if (!h.ok) console.log(`LET OP: waarschuw-status niet op te vragen (server ${h.status}).`);
else if (!laatst || Date.now() - laatst > 20 * 60_000) console.log(`LET OP: waarschuwen draaide niet sinds ${laatst ? hm(laatst) : "onbekend"}.`);

export {};
