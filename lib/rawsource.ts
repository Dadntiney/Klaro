import type { NDResponse, NextDNSClient } from "./overview.ts";
import { parseRaw, rawEvents, type RawQuery, type RawRow } from "./rawlog.ts";

/**
 * De volledige download (alle regels van NextDNS) in de browser: bewaard (IndexedDB) en daarna alleen aangevuld met wat er nieuw
 * is (?since=). Zo hoeft de telefoon niet elke keer het hele logboek (tientallen MB) opnieuw te halen. Eén keer per dag wel
 * helemaal opnieuw, zodat wat bij NextDNS is weggehaald (bewaartermijn, logboek geleegd) ook hier verdwijnt: NextDNS blijft de bron.
 * Ook om in alle regels te zoeken (NextDNS-weergave) en om alleen de laatste uren opnieuw te berekenen (recent()).
 * Het bestand staat op tijd, nieuwste eerst; de eerste kolom is het tijdstip.
 */
const DAY = 86_400_000;
const OVERLAP = 10 * 60_000; // de laatste 10 minuten altijd opnieuw (regels die NextDNS net later wegschrijft)

type Saved = { text: string; fullAt: number };

function idb(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      const r = indexedDB.open("klaro", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function load(): Promise<Saved | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((res) => {
    try {
      const q = db.transaction("kv").objectStore("kv").get("download");
      q.onsuccess = () => res((q.result as Saved) ?? null);
      q.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function save(v: Saved): Promise<void> {
  const db = await idb();
  if (!db) return;
  try { db.transaction("kv", "readwrite").objectStore("kv").put(v, "download"); } catch { /* vol of niet toegestaan: dan volgende keer gewoon alles */ }
}

/** Tijdstip van een regel (eerste kolom), 0 als het niet lukt. */
const lineT = (line: string) => Date.parse(line.slice(0, line.indexOf("\t"))) || 0;

/**
 * Nieuwe regels (nieuwste eerst, met kop) vóór de bewaarde regels die ouder zijn dan `since` zetten. `null` als de kolommen
 * anders zijn (Klaro bewaart sinds een update meer of andere gegevens): dan moet alles opnieuw.
 */
export function mergeDownload(old: string, fresh: string, since: number): string | null {
  const oh = old.indexOf("\n");
  const fh = fresh.indexOf("\n");
  if (oh < 0 || fh < 0 || old.slice(0, oh) !== fresh.slice(0, fh)) return null; // andere kolommen: alles opnieuw ophalen
  // Eerste bewaarde regel die niet nieuwer is dan `since` (een paar regels kunnen net door elkaar staan: die vallen dubbel weg).
  let pos = oh + 1;
  while (pos < old.length) {
    const end = old.indexOf("\n", pos);
    const line = old.slice(pos, end < 0 ? old.length : end);
    if (line && lineT(line) && lineT(line) <= since) break; // een kapotte regel (geen tijd) is geen grens
    pos = end < 0 ? old.length : end + 1;
  }
  // Stuurt de server toch meer (oude server zonder ?since): alleen de nieuwe regels gebruiken.
  let fpos = fh + 1;
  while (fpos < fresh.length) {
    const end = fresh.indexOf("\n", fpos);
    const line = fresh.slice(fpos, end < 0 ? fresh.length : end);
    if (line && lineT(line) && lineT(line) <= since) break; // een kapotte regel (geen tijd) is geen grens
    fpos = end < 0 ? fresh.length : end + 1;
  }
  // Alleen hele regels met een geldige tijd bewaren: een afgekapte regel (verbinding even weg) zou anders blijven hangen.
  const body = fresh.slice(fh + 1, fpos).split("\n").filter((l) => l && lineT(l)).map((l) => l + "\n").join("");
  return old.slice(0, oh + 1) + body + old.slice(pos);
}

export function rawSource(base: NextDNSClient & { since?: (since: number, ms: number) => Promise<NDResponse> }) {
  let text: string | null = null;
  let fullAt = 0;
  let at = 0;
  let rows: RawRow[] | null = null;
  let loaded = false;
  let inflight: Promise<void> | null = null;
  const asResponse = (t: string) => ({ ok: true, status: 200, text: async () => t, json: async () => JSON.parse(t) }) as NDResponse;

  async function refresh(ms: number): Promise<NDResponse | null> {
    if (!loaded) { loaded = true; const s = await load(); if (s && !text) { text = s.text; fullAt = s.fullAt; } }
    const newest = text ? lineT(text.slice(text.indexOf("\n") + 1, text.indexOf("\n", text.indexOf("\n") + 1))) : 0;
    if (text && base.since && newest && Date.now() - fullAt < DAY) {
      try {
        const since = newest - OVERLAP;
        const r = await base.since(since, ms);
        const merged = r.ok ? mergeDownload(text, await r.text(), since) : null;
        if (merged !== null) {
          text = merged;
          at = Date.now(); rows = null;
          void save({ text, fullAt });
          return asResponse(text);
        }
        if (r.status === 401) return r;
      } catch { /* dan alles opnieuw */ }
    }
    const r = await base.download(ms);
    if (!r.ok) return r;
    const t = await r.text();
    text = t; fullAt = Date.now(); at = Date.now(); rows = null;
    void save({ text, fullAt });
    return asResponse(t);
  }

  const client: NextDNSClient = {
    logs: base.logs,
    download: async (ms) => (await refresh(ms))!,
  };

  /** Alleen de regels vanaf `from` (voor het snelle herberekenen van de laatste uren). */
  function recentClient(from: number): NextDNSClient {
    return {
      logs: base.logs,
      download: async (ms) => {
        const r = await refresh(ms);
        if (!r || !r.ok || !text) return r!;
        let pos = text.indexOf("\n") + 1;
        while (pos < text.length) {
          const end = text.indexOf("\n", pos);
          const line = text.slice(pos, end < 0 ? text.length : end);
          if (line && lineT(line) < from) break;
          pos = end < 0 ? text.length : end + 1;
        }
        return asResponse(text.slice(0, pos));
      },
    };
  }

  async function search(q: RawQuery) {
    if (!text || Date.now() - at > 300_000) {
      if (!inflight) inflight = client.download(90_000).then((r) => { if (!r.ok) throw new Error(String(r.status)); }).finally(() => { inflight = null; });
      try { await inflight; } catch { if (!text) return { status: 502, body: { error: "NextDNS is niet bereikbaar." } }; }
    }
    if (!rows) rows = parseRaw(text!);
    return { status: 200, body: { ...(await rawEvents(rows, q)), until: rows[0]?.t ?? 0, since: rows[rows.length - 1]?.t ?? 0 } };
  }
  return { client, recentClient, search };
}
