import { buildOverview } from "./overview.ts";
import { php, serverLists } from "./php-client.ts";
import { liveEvents } from "./live.ts";
import { siteDetail } from "./detail.ts";
import { rawSource } from "./rawsource.ts";
import type { RawQuery } from "./rawlog.ts";

/**
 * Klaro in de browser (eigen hosting met PHP): de pagina roept dezelfde adressen aan als vroeger (/api/nextdns, /live,
 * /detail), maar de berekening gebeurt hier met precies dezelfde code. De eigen server (api/*.php) doet alleen wat geheim
 * moet blijven: de NextDNS-sleutel, het wachtwoord en de grote 18+/datinglijsten.
 */

serverLists();

// Het zware rekenwerk (alle dagen) in een worker; lukt dat niet (oude browser), dan gewoon hier. Vandaag in een eigen tweede
// worker: anders wacht het snelle eerste beeld soms tot de grote berekening van alle dagen klaar is (gemeten: tot 15 s).
const workers: { full: Worker | null; today: Worker | null } = { full: null, today: null };
let nextId = 1;
const waiting = new Map<number, (r: { status: number; body: unknown }) => void>();
const owner = new Map<number, "full" | "today">(); // welke worker een vraag beantwoordt (om bij een fout alleen die vragen te laten vallen)
const local = rawSource(php); // zonder worker (oude browser): hier zoeken
function inWorker(opts: { todayOnly: boolean; hours?: number; raw?: RawQuery; recent?: boolean; all?: boolean }): Promise<{ status: number; body: unknown }> {
  const fallback = async () => {
    if (opts.raw) return local.search(opts.raw);
    if (opts.all) local.expand();
    const r = await buildOverview(opts.todayOnly ? php : local.client, opts);
    if (r.status === 200 && !opts.todayOnly) (r.body as { windowFrom?: number }).windowFrom = local.windowFrom();
    return r;
  };
  try {
    const kind = opts.todayOnly ? "today" : "full";
    let worker = workers[kind];
    if (!worker) {
      const w = (worker = workers[kind] = new Worker("/overview-worker.js"));
      w.onmessage = (e: MessageEvent<{ id: number; status: number; body: unknown }>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); owner.delete(e.data.id); };
      w.onerror = () => { for (const [id, k] of owner) if (k === kind) { waiting.get(id)?.({ status: 0, body: null }); waiting.delete(id); owner.delete(id); } workers[kind] = null; };
    }
    const id = nextId++;
    owner.set(id, kind);
    return new Promise((done) => { waiting.set(id, done); worker!.postMessage({ id, ...opts }); }).then((r) => {
      const res = r as { status: number; body: unknown };
      if (res.status === 401 && typeof location !== "undefined") location.href = "/login?verlopen=1"; // in de worker: sessie verlopen of uitgelogd
      return res.status === 0 ? fallback() : res;
    });
  } catch {
    return fallback();
  }
}

// Alles ophalen is traag (grote download): kort hergebruiken, en tegelijke aanvragen samennemen.
let full: { at: number; status: number; body: unknown } | null = null;
let fullInflight: Promise<{ status: number; body: unknown }> | null = null;

function answer(r: { status: number; body: unknown }): Response {
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
}

/** Zoals `fetch` voor de oude /api/nextdns-adressen. */
export async function apiFetch(path: string, init?: { signal?: AbortSignal }): Promise<Response> {
  void init;
  const url = new URL(path, "https://klaro.local");
  try {
    if (url.pathname === "/api/nextdns") {
      // Het eerste snelle beeld (laatste 1,5 uur, weinig regels) meteen hier: een worker moet eerst zijn script laden, en dan
      // wacht dit kleine verzoek soms op de grote download. De hele dag van vandaag (veel rekenwerk, blokkeerde op een telefoon
      // de pagina tot ~1 s) in een eigen worker.
      if (url.searchParams.get("scope") === "today") {
        const hours = Number(url.searchParams.get("hours")) || 0;
        return answer(hours ? await buildOverview(php, { todayOnly: true, hours }) : await inWorker({ todayOnly: true, hours: 0 }));
      }
      // Alleen de laatste uren opnieuw, met dezelfde regels (elke minuut; zie lib/recent.ts). Zonder worker: gewoon alles.
      if (url.searchParams.get("scope") === "recent") return answer(await inWorker({ todayOnly: false, recent: true }));
      // Oudere dagen laden (?all=1): eenmalig alles ophalen en uitrekenen.
      if (url.searchParams.get("all")) { full = null; const r = await inWorker({ todayOnly: false, all: true }); if (r.status === 200) full = { at: Date.now(), ...r }; return answer(r); }
      if (full && Date.now() - full.at < 120_000) return answer(full);
      if (!fullInflight) fullInflight = inWorker({ todayOnly: false }).finally(() => { fullInflight = null; });
      const r = await fullInflight;
      if (r.status === 200) full = { at: Date.now(), ...r };
      return answer(r);
    }
    if (url.pathname === "/api/nextdns/raw") {
      const q = url.searchParams;
      const devs = q.get("devs");
      return answer(await inWorker({ todayOnly: false, raw: { q: q.get("q") ?? "", devIds: devs ? devs.split(",") : null, before: Number(q.get("before")) || Infinity, limit: 300 } }));
    }
    if (url.pathname === "/api/nextdns/live") return answer(await liveEvents(php, Number(url.searchParams.get("since")) || 0));
    if (url.pathname === "/api/nextdns/detail") {
      const q = url.searchParams;
      return answer(await siteDetail(php, { dev: q.get("dev") ?? "", site: q.get("site") ?? "", from: Number(q.get("from")), to: Number(q.get("to")) }));
    }
  } catch {
    return answer({ status: 502, body: { error: "De server is niet bereikbaar." } });
  }
  return answer({ status: 404, body: { error: "Onbekend adres." } });
}
