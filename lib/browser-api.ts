import { buildOverview, type NDResponse, type NextDNSClient } from "./overview.ts";
import { liveEvents } from "./live.ts";
import { siteDetail } from "./detail.ts";
import { setRemoteLists } from "./adultlist.ts";

/**
 * Klaro in de browser (eigen hosting met PHP): de pagina roept dezelfde adressen aan als vroeger (/api/nextdns, /live,
 * /detail), maar de berekening gebeurt hier met precies dezelfde code. De eigen server (api/*.php) doet alleen wat geheim
 * moet blijven: de NextDNS-sleutel, het wachtwoord en de grote 18+/datinglijsten.
 */

/** Niet ingelogd (of uitgelogd na een nieuw wachtwoord): naar het inlogscherm. */
function checkLogin(res: Response): Response {
  if (res.status === 401 && typeof location !== "undefined" && !location.pathname.startsWith("/login")) location.href = "/login";
  return res;
}

const php: NextDNSClient = {
  logs: async (q, ms) => checkLogin(await fetch(`/api/nd.php?q=${encodeURIComponent(q)}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(ms) })) as NDResponse,
  download: async (ms) => checkLogin(await fetch("/api/nd.php?download=1", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(Math.max(ms, 90_000)) })) as NDResponse,
};

setRemoteLists(async (hosts) => {
  const res = checkLogin(await fetch("/api/lists.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hosts }), credentials: "same-origin" }));
  if (!res.ok) throw new Error("lijsten niet bereikbaar");
  return (await res.json()) as { adult: string[]; dating: string[] };
});

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
      if (!fullInflight) fullInflight = buildOverview(php, { todayOnly: false }).finally(() => { fullInflight = null; });
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
