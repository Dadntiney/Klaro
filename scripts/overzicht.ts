// Haalt het volledige overzicht op zoals de pagina het berekent (zelfde code), via de eigen server (pichya.nl/api/nd.php).
// Gebruik: KLARO_PW=... node --experimental-strip-types scripts/overzicht.ts > overzicht.json
// Daarna: scripts/referentie.ts overzicht.json en scripts/gemist.ts overzicht.json. Het wachtwoord nooit in een bestand zetten.
import { buildOverview, type NextDNSClient } from "../lib/overview.ts";

const site = process.env.KLARO_SITE ?? "https://pichya.nl";
const pw = process.env.KLARO_PW;
if (!pw) throw new Error("KLARO_PW ontbreekt");
const auth = { Authorization: "Basic " + Buffer.from("klaro:" + pw).toString("base64") };
const client: NextDNSClient = {
  logs: (q, ms) => fetch(`${site}/api/nd.php?q=${encodeURIComponent(q)}`, { headers: auth, signal: AbortSignal.timeout(ms) }),
  download: (ms) => fetch(`${site}/api/nd.php?download=1`, { headers: auth, signal: AbortSignal.timeout(Math.max(ms, 120_000)) }),
};
const r = await buildOverview(client, { todayOnly: process.argv.includes("--vandaag") });
if (r.status !== 200) { console.error(r.status, JSON.stringify(r.body)); process.exit(1); }
process.stdout.write(JSON.stringify(r.body));
