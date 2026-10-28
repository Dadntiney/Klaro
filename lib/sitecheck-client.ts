// Websitecontrole (api/sitecheck.php) voor nieuwe sites: staat er op dat adres wel een echte website? Alleen een aanwijzing:
// "geen echte website" maakt een regel onzeker, nooit onzichtbaar (ook advertentiebedrijven hebben een site, en andersom).
export type SiteCheck = { soort: string; titel?: string; naar?: string };

const cache = new Map<string, Promise<SiteCheck | null>>();

/** Eén keer per adres opvragen (de server onthoudt het 30 dagen; 18+/dating haalt hij nooit op); bij een fout: onbekend. */
export function siteCheck(host: string): Promise<SiteCheck | null> {
  let p = cache.get(host);
  if (!p) {
    p = fetch("/api/sitecheck.php?host=" + encodeURIComponent(host), { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<SiteCheck>) : null))
      .catch(() => null);
    cache.set(host, p);
  }
  return p;
}

/** Geen echte website: alleen techniek (script, data), een foutcode of een lege pagina. Onbereikbaar of doorsturen telt niet:
 *  dat kan aan de server liggen of een gewone verhuizing zijn (bol.nl -> bol.com). Afgeschermd (robot geweerd) ook niet. */
export function noRealSite(v: SiteCheck | null | undefined): boolean {
  return !!v && (v.soort === "techniek" || v.soort === "geen pagina" || v.soort === "leeg");
}
