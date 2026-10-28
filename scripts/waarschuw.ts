// Waarschuwen bij 18+, dating en VPN/omzeiling, ook als Klaro niet openstaat. Draait elke 5 minuten op GitHub
// (.github/workflows/waarschuw.yml) en beoordeelt de nieuwe regels met precies dezelfde code als de pagina (lib/sites.ts, de
// 18+/datinglijsten in data/). De server geeft de regels en de abonnementen (api/alert.php); de melding gaat rechtstreeks naar
// de push-dienst van Apple, versleuteld (lib/webpush.ts).
// Gebruik: KLARO_GEHEIM=... node --experimental-strip-types scripts/waarschuw.ts   (KLARO_GEHEIM = het bestaande deploy-geheim)
//          ... scripts/waarschuw.ts --proef   (alleen kijken wat er gemeld zou worden, niets versturen of bijwerken)
import { classify } from "../lib/sites.ts";
import { extractHost } from "../lib/parse.ts";
import { deviceType, labelDevices } from "../lib/names.ts";
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

export type DevStat = { id: string; first: number; last: number; maxGap: number; days7: number; name: string; model: string };

const HOUR = 3_600_000;
const labels = (devs: DevStat[]) => labelDevices(devs.map((d) => ({ id: d.id, type: deviceType(d.name, d.model) })));
const uren = (ms: number) => (ms >= 48 * HOUR ? `${Math.round(ms / 86_400_000)} dagen` : `${Math.max(1, Math.round(ms / HOUR))} uur`);

/**
 * Ongewoon lang stil: langer dan twee keer de langste pauze van de laatste 14 dagen, en minstens 3 uur. Alleen voor apparaten
 * die bijna elke dag actief zijn (5 van de 7 dagen) en minstens een week geschiedenis hebben. Gemeten (20 okt): iPhone en
 * Apple TV nooit langer dan een half uur stil (ook 's nachts), iPad hooguit 12 uur, MacBook vaak dagen uit (telt dus niet).
 * Stil = NextDNS ziet het apparaat niet meer: profiel weg, VPN aan, of uit.
 */
export function silentAlerts(devs: DevStat[], now: number): Alert[] {
  const name = labels(devs);
  return devs
    .filter((d) => d.days7 >= 5 && now - d.first >= 7 * 86_400_000 && now - d.last > Math.max(3 * HOUR, 2 * d.maxGap))
    .map((d) => ({ key: `stil|${d.id}`, t: d.last, title: "Klaro: apparaat stil", body: `${name[d.id]} is al ${uren(now - d.last)} stil (normaal hooguit ${uren(d.maxGap)}). Uit, VPN aan, of NextDNS-profiel weg?` }));
}

/**
 * Nieuw apparaat: een apparaat dat NextDNS de laatste 30 min voor het eerst zag (bijvoorbeeld een nieuwe telefoon met hetzelfde
 * NextDNS-profiel), terwijl de kopie al minstens 2 dagen loopt (anders is alles "nieuw").
 */
export function newDeviceAlerts(devs: DevStat[], now: number): Alert[] {
  if (!devs.length || now - Math.min(...devs.map((d) => d.first)) < 2 * 86_400_000) return [];
  const name = labels(devs);
  return devs
    .filter((d) => now - d.first < 30 * 60_000)
    .map((d) => ({ key: `nieuw|${d.id}`, t: d.first, title: "Klaro: nieuw apparaat", body: `${name[d.id]}${d.model ? ` (${d.model})` : ""} gebruikt NextDNS voor het eerst, sinds ${hm(d.first)}.` }));
}

/**
 * Wat er op het scherm van de iPhone komt: nooit wat er gebeurde (geen 18+, site of apparaat), zodat een meekijker niets
 * ziet (wens eigenaar). De echte tekst staat in Klaro onder "Laatste meldingen", pas na inloggen.
 */
export function pushText(key: string): { title: string; body: string; tag: string } {
  // De iPhone zet er zelf "from Klaro" onder; de titel is dus de boodschap (anders staat er twee keer Klaro).
  if (key === "proef") return { title: "Meldingen staan aan", body: "Je krijgt hier bericht als er iets is.", tag: "proef" };
  return { title: "Er is iets om te bekijken", body: "Tik om het te bekijken.", tag: "melding" };
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
  const devs = (got.devices ?? []) as DevStat[];
  const now = Number(got.now) || Date.now();
  const alerts = [...findAlerts(got.cols as string[], got.rows as string[]), ...silentAlerts(devs, now), ...newDeviceAlerts(devs, now)];
  // Geen namen of adressen in het logboek van GitHub (openbaar): alleen aantallen.
  console.log(`${(got.rows as string[]).length} nieuwe regels, ${alerts.length} melding(en) gevonden, ${devs.length} apparaten, ${got.subs} abonnement(en)`);
  if (proef) return;
  const res = await api(url, k, { until: got.until, alerts: alerts.map(({ key, title, body }) => ({ key, title, body })) });
  const subs = res.subs as Sub[];
  const send = res.send as { title: string; body: string; tag: string }[];
  const tests = new Set(res.test as string[]);
  const gone: string[] = [];
  let ok = 0, fail = 0;
  for (const s of subs) {
    const msgs = [...send];
    if (tests.has(s.endpoint)) msgs.push({ title: "", body: "", tag: "proef" });
    for (const m of msgs) {
      const st = await sendPush(s, pushText(m.tag), k).catch(() => 0);
      if (st === 404 || st === 410) { gone.push(s.endpoint); break; }
      if (st >= 200 && st < 300) ok++; else fail++;
    }
  }
  if (gone.length) await api(url, k, { gone });
  console.log(`${send.length} melding(en) nieuw, ${ok} verstuurd, ${fail} mislukt, ${gone.length} abonnement(en) vervallen`);
  if (fail) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
