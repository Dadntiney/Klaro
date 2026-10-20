// Waarschuwen bij 18+, dating en VPN/omzeiling, ook als Klaro niet openstaat. Draait elke 5 minuten op GitHub
// (.github/workflows/waarschuw.yml) en beoordeelt de nieuwe regels met precies dezelfde code als de pagina (lib/sites.ts, de
// 18+/datinglijsten in data/). De server geeft de regels en de abonnementen (api/alert.php); de melding gaat rechtstreeks naar
// de push-dienst van Apple, versleuteld (lib/webpush.ts).
// Gebruik: KLARO_GEHEIM=... node --experimental-strip-types scripts/waarschuw.ts   (KLARO_GEHEIM = het bestaande deploy-geheim)
//          ... scripts/waarschuw.ts --proef   (alleen kijken wat er gemeld zou worden, niets versturen of bijwerken)
import { classify } from "../lib/sites.ts";
import { extractHost } from "../lib/parse.ts";
import { deviceType } from "../lib/names.ts";
import { keysFrom, sendPush, type Keys, type Sub } from "../lib/webpush.ts";

export type Alert = { key: string; title: string; body: string; t: number };

const hm = (t: number) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(t);

/** Rood in Klaro = melden: dezelfde beoordeling als lib/overview.ts (vangnet-label, of NextDNS blokkeerde porno/dating). */
export function flagOf(host: string, status: string, reasons: string): string | undefined {
  const info = classify(host);
  if (info.flag) return info.flag;
  if (status.toLowerCase() === "blocked" && /porn|adult|sex|dating|erotic/.test(reasons.toLowerCase())) return "Geblokkeerd 18+/dating";
  return undefined;
}

/** Eén melding per apparaat + site (de eerste keer in deze reeks). */
export function findAlerts(cols: string[], rows: string[]): Alert[] {
  const c = (n: string) => cols.indexOf(n);
  const [ti, di, si, ri, ii, ni, mi] = ["timestamp", "domain", "status", "reasons", "device_id", "device_name", "device_model"].map(c);
  const out = new Map<string, Alert>();
  for (const line of rows) {
    const r = line.split("\t");
    const host = extractHost(r[di] ?? "");
    const t = Date.parse(r[ti] ?? "");
    if (!host || !t) continue;
    const flag = flagOf(host, r[si] ?? "", r[ri] ?? "");
    if (!flag) continue;
    const site = classify(host).site;
    const key = `${(r[ii] ?? "").trim() || "?"}|${site}`;
    const prev = out.get(key);
    if (prev && prev.t <= t) continue;
    const dev = deviceType(r[ni] ?? "", r[mi] ?? "");
    out.set(key, { key, t, title: `Klaro: ${flag}`, body: `${site} op ${dev === "Onbekend" ? "een apparaat" : dev}, ${hm(t)}` });
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}

async function api(url: string, k: Keys, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Klaro-Sleutel": k.alertKey, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  });
  if (!res.ok) throw new Error(`server ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  const secret = process.env.KLARO_GEHEIM ?? "";
  if (!secret) throw new Error("KLARO_GEHEIM ontbreekt");
  const proef = process.argv.includes("--proef");
  const k = keysFrom(secret);
  const url = (process.env.KLARO_URL ?? "https://pichya.nl") + "/api/alert.php";
  const got = await api(url, k);
  const alerts = findAlerts(got.cols as string[], got.rows as string[]);
  // Geen namen of adressen in het logboek van GitHub (openbaar): alleen aantallen.
  console.log(`${(got.rows as string[]).length} nieuwe regels, ${alerts.length} keer rood, ${got.subs} abonnement(en)`);
  if (proef) return;
  const res = await api(url, k, { until: got.until, alerts: alerts.map(({ key, title, body }) => ({ key, title, body })) });
  const subs = res.subs as Sub[];
  const send = res.send as { title: string; body: string; tag: string }[];
  const tests = new Set(res.test as string[]);
  const gone: string[] = [];
  let ok = 0, fail = 0;
  for (const s of subs) {
    const msgs = [...send];
    if (tests.has(s.endpoint)) msgs.push({ title: "Klaro", body: "Meldingen staan aan. Bij 18+, dating of VPN krijg je hier bericht.", tag: "proef" });
    for (const m of msgs) {
      const st = await sendPush(s, m, k).catch(() => 0);
      if (st === 404 || st === 410) { gone.push(s.endpoint); break; }
      if (st >= 200 && st < 300) ok++; else fail++;
    }
  }
  if (gone.length) await api(url, k, { gone });
  console.log(`${send.length} melding(en) nieuw, ${ok} verstuurd, ${fail} mislukt, ${gone.length} abonnement(en) vervallen`);
  if (fail) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
