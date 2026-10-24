import type { NDResponse, NextDNSClient } from "./overview.ts";
import { setRemoteLists } from "./adultlist.ts";
import { setGeleerdSource, type GeleerdData } from "./geleerd.ts";

/** Niet ingelogd, of automatisch uitgelogd na 60 minuten zonder gebruik: naar het inlogscherm (alleen op de pagina, niet in de worker). */
export function checkLogin(res: Response): Response {
  if (res.status === 401 && typeof location !== "undefined" && typeof document !== "undefined" && !location.pathname.startsWith("/login"))
    location.href = res.headers.get("X-Klaro-Login") === "verlopen" ? "/login?verlopen=1" : "/login";
  return res;
}

/** Via de eigen server (api/nd.php voegt de geheime NextDNS-sleutel toe). Werkt op de pagina en in een worker. */
export const php: NextDNSClient & { since: (since: number, ms: number) => Promise<NDResponse> } = {
  logs: async (q, ms) => checkLogin(await fetch(`/api/nd.php?q=${encodeURIComponent(q)}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(ms) })) as NDResponse,
  download: async (ms) => checkLogin(await fetch("/api/nd.php?download=1", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(Math.max(ms, 90_000)) })) as NDResponse,
  /** Alleen de regels van na `since` (ms): de rest bewaart de browser zelf (lib/rawsource.ts). */
  since: async (since: number, ms: number) => checkLogin(await fetch(`/api/nd.php?download=1&since=${Math.floor(since)}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(Math.max(ms, 60_000)) })) as NDResponse,
};

/** De grote 18+/datinglijsten en wat Klaro eerder leerde staan op de server: daar navragen (alleen na inloggen). */
export function serverLists() {
  setGeleerdSource(async () => {
    const res = checkLogin(await fetch("/api/geleerd.php", { cache: "no-store", credentials: "same-origin" }));
    if (!res.ok) throw new Error("geleerd niet bereikbaar");
    return (await res.json()) as GeleerdData;
  });
  setRemoteLists(async (hosts) => {
    const res = checkLogin(await fetch("/api/lists.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hosts }), credentials: "same-origin" }));
    if (!res.ok) throw new Error("lijsten niet bereikbaar");
    return (await res.json()) as { adult: string[]; dating: string[] };
  });
}
