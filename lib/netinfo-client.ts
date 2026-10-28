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

/** Uitleg bij een regel die niet via de wifi thuis ging (tooltip). Alleen wat zeker is: het netwerk, niet de plek. Mobiele data kan
 *  ook thuis zijn (de iPhone schakelt over als de wifi even slecht is, wens eigenaar 28 okt); een andere wifi is wel een andere plek. */
export function netLabel(info: NetInfo | null | undefined): string {
  const merk = info?.merk ? ` · ${info.merk}` : "";
  if (info?.soort === "mobiel") return `mobiele data${merk} (kan ook thuis zijn, als de wifi even wegvalt)`;
  if (info?.soort === "vast") return `andere wifi${merk} (een andere plek)`;
  return `niet via de wifi thuis${merk}`;
}

const landNaam = (code: string) => { try { return new Intl.DisplayNames(["nl"], { type: "region" }).of(code) ?? code; } catch { return code; } };

/**
 * Wat er bij een regel die niet via de wifi thuis ging staat ("Mobiele data (Vodafone)", "Andere wifi (Odido)"): icoontje + korte tekst, en een uitleg (tooltip).
 * - eigen naam van het netwerk (door de eigenaar gegeven) gaat voor de provider;
 * - laptop/tablet op het mobiele internet van een telefoon: "hotspot iPhone";
 * - een netwerk in een ander land: " · Duitsland" erachter.
 */
export function netText(info: NetInfo | null | undefined, opts: { naam?: string; hotspot?: string } = {}): { icon: "mobiel" | "vast" | "hotspot" | null; text: string; uitleg: string } {
  const hot = !!opts.hotspot && info?.soort === "mobiel";
  const icon = hot ? "hotspot" : info?.soort ?? null;
  const merk = info?.merk ? ` (${info.merk})` : "";
  const base = hot ? `hotspot ${opts.hotspot}` : opts.naam ?? (info?.soort === "mobiel" ? `Mobiele data${merk}` : info?.soort === "vast" ? `Andere wifi${merk}` : "Niet via thuis-wifi");
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

