// Soort netwerk bij een internetadres (api/netinfo.php): mobiel internet, een vaste aansluiting (andere wifi) of onbekend.
export type NetInfo = { soort: "mobiel" | "vast" | null; naam?: string; merk?: string | null };

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

/** Korte tekst bij een regel buiten het thuisnetwerk, met de provider als die bekend is ("mobiel · Vodafone"). Kort, want hij staat
 *  naast het apparaat op één regel. Thuis (op de eigen wifi) staat er niets. */
export function netLabel(info: NetInfo | null | undefined): string {
  const soort = info?.soort === "mobiel" ? "mobiel" : info?.soort === "vast" ? "wifi" : "niet thuis";
  return info?.merk ? `${soort} · ${info.merk}` : soort;
}
