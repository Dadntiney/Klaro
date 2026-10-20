// "Klopt niet"-meldingen van de eigenaar (api/feedback.php): bekijken en afhandelen in de dagelijkse controle.
// Gebruik: KLARO_PW=... node --experimental-strip-types scripts/feedback.ts                 (open meldingen)
//          KLARO_PW=... node --experimental-strip-types scripts/feedback.ts --klaar <id> "Kort antwoord voor de eigenaar"
export {};
const pw = process.env.KLARO_PW;
if (!pw) throw new Error("KLARO_PW ontbreekt");
const url = (process.env.KLARO_SITE ?? "https://pichya.nl") + "/api/feedback.php";
const auth = { Authorization: "Basic " + Buffer.from("klaro:" + pw).toString("base64") };
const hm = (t: number) => new Date(t).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const i = process.argv.indexOf("--klaar");
if (i > 0) {
  const res = await fetch(url, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ done: process.argv[i + 1], antwoord: process.argv[i + 2] ?? "" }) });
  console.log(res.ok ? "Afgehandeld." : `Lukte niet (${res.status}).`);
} else {
  const res = await fetch(url, { headers: auth });
  if (!res.ok) throw new Error("Ophalen mislukt: " + res.status);
  const items = ((await res.json()) as { items: { id: string; at: number; kind: string; dev: string; site: string; name: string; s: number; e: number; note: string; done: number }[] }).items;
  const open = items.filter((x) => !x.done);
  console.log(`${open.length} open melding(en) van de eigenaar.`);
  for (const x of open)
    console.log(`- [${x.id}] ${x.kind === "fout" ? "Klopt niet" : "Gemist"} (gemeld ${hm(x.at)}): ${[x.dev, x.name || x.site, x.s ? `${hm(x.s)}–${hm(x.e)}` : ""].filter(Boolean).join(" · ")}${x.note ? ` — "${x.note}"` : ""}`);
}
