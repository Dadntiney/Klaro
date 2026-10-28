// Soort netwerk bij een internetadres (api/netinfo.php): mobiel internet, een vaste aansluiting (andere wifi) of onbekend.
export type NetInfo = { soort: "mobiel" | "vast" | null; naam?: string; merk?: string | null; land?: string | null };

const cache = new Map<string, Promise<NetInfo | null>>();

/** Eén keer per adres opvragen (de server onthoudt het 30 dagen); bij een fout: onbekend. */
export function netInfo(ip: string): Promise<NetInfo | null> {
  let p = cache.get(ip);
  if (!p) {
    p = fetch("/api/netinfo.php?ip=" + encodeURIComponent(ip), { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<NetInfo>) : null))
      .catch(() => null);
    cache.set(ip, p);
  }
  return p;
}

/** Uitleg bij een regel buiten het thuisnetwerk (als tooltip; op de regel zelf staat een icoontje met de provider). Thuis: niets. */
export function netLabel(info: NetInfo | null | undefined): string {
  const soort = info?.soort === "mobiel" ? "mobiel internet" : info?.soort === "vast" ? "andere wifi" : "niet thuis";
  return info?.merk ? `${soort} · ${info.merk}` : soort;
}

const landNaam = (code: string) => { try { return new Intl.DisplayNames(["nl"], { type: "region" }).of(code) ?? code; } catch { return code; } };

/**
 * Wat er bij een regel buiten de wifi thuis staat: icoontje + korte tekst, en een uitleg (tooltip).
 * - eigen naam van het netwerk (door de eigenaar gegeven) gaat voor de provider;
 * - laptop/tablet op het mobiele internet van een telefoon: "hotspot iPhone";
 * - een netwerk in een ander land: " · Duitsland" erachter.
 */
export function netText(info: NetInfo | null | undefined, opts: { naam?: string; hotspot?: string } = {}): { icon: "mobiel" | "vast" | "hotspot" | null; text: string; uitleg: string } {
  const hot = !!opts.hotspot && info?.soort === "mobiel";
  const icon = hot ? "hotspot" : info?.soort ?? null;
  const base = hot ? `hotspot ${opts.hotspot}` : opts.naam ?? info?.merk ?? (info?.soort === "mobiel" ? "mobiel" : info?.soort === "vast" ? "wifi" : "niet thuis");
  const land = info?.land && info.land !== "NL" ? landNaam(info.land) : "";
  const text = land ? `${base} · ${land}` : base;
  const uitleg = (hot ? `via de hotspot van ${opts.hotspot} (mobiel internet)` : netLabel(info)) + (opts.naam && info?.merk ? ` (${info.merk})` : "") + (land ? `, in ${land}` : "");
  return { icon, text, uitleg };
}

/** Eigen namen voor netwerken (api/netnames.php). */
export async function netNames(): Promise<Record<string, string>> {
  try { const r = await fetch("/api/netnames.php", { credentials: "same-origin" }); return r.ok ? ((await r.json()).namen ?? {}) : {}; } catch { return {}; }
}
export async function setNetName(netwerk: string, naam: string): Promise<Record<string, string>> {
  const r = await fetch("/api/netnames.php", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ netwerk, naam }) });
  if (!r.ok) throw new Error("Opslaan lukte niet.");
  return (await r.json()).namen ?? {};
}

