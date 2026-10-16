import { buildOverview } from "./overview.ts";
import { php, serverLists } from "./php-client.ts";
import { liveEvents } from "./live.ts";
import { siteDetail } from "./detail.ts";

/**
 * Klaro in de browser (eigen hosting met PHP): de pagina roept dezelfde adressen aan als vroeger (/api/nextdns, /live,
 * /detail), maar de berekening gebeurt hier met precies dezelfde code. De eigen server (api/*.php) doet alleen wat geheim
 * moet blijven: de NextDNS-sleutel, het wachtwoord en de grote 18+/datinglijsten.
 */

serverLists();

// Het zware rekenwerk (alle dagen) in een worker; lukt dat niet (oude browser), dan gewoon hier.
let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (r: { status: number; body: unknown }) => void>();
function inWorker(opts: { todayOnly: boolean; hours?: number }): Promise<{ status: number; body: unknown }> {
  try {
    if (!worker) {
      worker = new Worker("/overview-worker.js");
      worker.onmessage = (e: MessageEvent<{ id: number; status: number; body: unknown }>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
      worker.onerror = () => { for (const [, done] of waiting) done({ status: 0, body: null }); waiting.clear(); worker = null; };
    }
    const id = nextId++;
    return new Promise((done) => { waiting.set(id, done); worker!.postMessage({ id, ...opts }); }).then((r) => {
      const res = r as { status: number; body: unknown };
      if (res.status === 401 && typeof location !== "undefined") location.href = "/login";
      return res.status === 0 ? buildOverview(php, opts) : res;
    });
  } catch {
    return buildOverview(php, opts);
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
      if (url.searchParams.get("scope") === "today") return answer(await buildOverview(php, { todayOnly: true, hours: Number(url.searchParams.get("hours")) || 0 }));
      if (full && Date.now() - full.at < 120_000) return answer(full);
      if (!fullInflight) fullInflight = inWorker({ todayOnly: false }).finally(() => { fullInflight = null; });
      const r = await fullInflight;
      if (r.status === 200) full = { at: Date.now(), ...r };
      return answer(r);
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
