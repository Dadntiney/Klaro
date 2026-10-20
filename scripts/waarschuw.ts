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
import { buildOverview } from "../lib/overview.ts";
import { activeMinutes, usage, type UseGroup } from "../lib/usage.ts";

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

const hmin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}u${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const dayKey = (t: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(t);

/**
 * Schermtijd van de laatste 7 dagen (vandaag meegeteld), gemiddeld per dag per apparaat, met de app waar de meeste tijd in zat.
 * Precies de telling van de pagina (lib/overview.ts + lib/usage.ts): de minuten zijn dezelfde als de dagtotalen in Klaro.
 */
export async function screenTime(tsv: string, now: number): Promise<string> {
  const res = { ok: true, status: 200, text: async () => tsv, json: async () => ({}) };
  const client = { logs: async () => res, download: async () => res } as unknown as Parameters<typeof buildOverview>[0];
  const body = (await buildOverview(client, { todayOnly: false })).body as { groups?: UseGroup[]; auto?: string[]; followers?: Record<string, string> };
  const days = new Set(Array.from({ length: 7 }, (_, i) => dayKey(now - i * 86_400_000)));
  const groups = (body.groups ?? []).filter((g) => days.has(g.d));
  const { listed, shown } = usage(groups, { auto: new Set(body.auto ?? []), followers: body.followers ?? {} });
  const perDay = new Map<string, Map<string, ReturnType<typeof shown>>>(); // apparaat -> dag -> sessies
  const perApp = new Map<string, Map<string, number>>(); // apparaat -> app -> minuten
  for (const g of groups) {
    if (!listed(g)) continue;
    const ss = shown(g);
    if (!ss.length) continue;
    const dm = perDay.get(g.dev) ?? perDay.set(g.dev, new Map()).get(g.dev)!;
    dm.set(g.d, [...(dm.get(g.d) ?? []), ...ss]);
    const am = perApp.get(g.dev) ?? perApp.set(g.dev, new Map()).get(g.dev)!;
    const app = g.name.replace(/ \([^)]*\)$/, ""); // "Toca Boca (spel)" -> "Toca Boca"
    am.set(app, (am.get(app) ?? 0) + activeMinutes(ss));
  }
  const out = [...perDay].map(([dev, dm]) => {
    const total = [...dm.values()].reduce((n, ss) => n + activeMinutes(ss), 0);
    const top = [...(perApp.get(dev) ?? [])].sort((a, b) => b[1] - a[1])[0];
    return { dev, avg: Math.round(total / 7), top: top && top[1] >= 1 ? top[0] : "" };
  }).filter((x) => x.avg >= 1).sort((a, b) => b.avg - a.avg);
  return out.map((x) => `${x.dev} ${hmin(x.avg)}${x.top ? ` (vooral ${x.top})` : ""}`).join(", ");
}

/** Weekbericht op zondag tussen 19 en 21 uur: dat waarschuwen werkt, hoeveel meldingen er waren, welke apparaten actief zijn en hun schermtijd. */
export function weeklyAlert(devs: DevStat[], now: number, week: number, use?: string): Alert | undefined {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value, h = Number(parts.find((p) => p.type === "hour")?.value);
  if (wd !== "Sun" || h < 19 || h > 20) return undefined;
  const name = labels(devs);
  const active = devs.filter((d) => now - d.last < 24 * HOUR).map((d) => name[d.id]).sort();
  const quiet = devs.filter((d) => now - d.last >= 24 * HOUR).map((d) => `${name[d.id]} (${uren(now - d.last)})`).sort();
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(now);
  return {
    key: `week|${day}`, t: now, title: "Klaro: weekoverzicht",
    body: `${week === 0 ? "Geen waarschuwingen" : week === 1 ? "1 waarschuwing" : `${week} waarschuwingen`} deze week.${use ? ` Schermtijd per dag: ${use}.` : ` Actief: ${active.join(", ") || "geen"}.`}${quiet.length ? ` Al langer stil: ${quiet.join(", ")}.` : ""} Waarschuwen werkt.`,
  };
}

/**
 * Wat er op het scherm van de iPhone komt: nooit wat er gebeurde (geen 18+, site of apparaat), zodat een meekijker niets
 * ziet (wens eigenaar). De echte tekst staat in Klaro onder "Laatste meldingen", pas na inloggen.
 */
export function pushText(key: string): { title: string; body: string; tag: string } {
  // De iPhone zet er zelf "from Klaro" onder; de titel is dus de boodschap (anders staat er twee keer Klaro).
  if (key.startsWith("week|")) return { title: "Weekoverzicht staat klaar", body: "Tik om het te bekijken.", tag: "week" };
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
  let week = weeklyAlert(devs, now, Number(got.week) || 0);
  // Schermtijd alleen ophalen als het weekbericht nu echt verstuurd wordt (één keer per zondag); lukt het niet, dan zonder.
  if (week && !((got.sent ?? []) as string[]).includes(week.key)) {
    const use = await fetch(url + "?week=1", { headers: { "X-Klaro-Sleutel": k.alertKey }, signal: AbortSignal.timeout(110_000) })
      .then(async (r) => (r.ok ? screenTime(await r.text(), now) : ""))
      .catch(() => "");
    week = weeklyAlert(devs, now, Number(got.week) || 0, use);
  }
  const alerts = [...findAlerts(got.cols as string[], got.rows as string[]), ...silentAlerts(devs, now), ...(week ? [week] : [])];
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
