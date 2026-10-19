/**
 * Wat Klaro uit de geschiedenis heeft geleerd, vastgelegd zodat het niet verloren gaat als het NextDNS-logboek wordt leeggemaakt.
 * Wordt elke dag aangevuld door scripts/leer.ts. Elk punt onthoudt wanneer het voor het laatst in de logboeken gezien is en geldt
 * tot 90 dagen daarna (genoeg om na het legen van het logboek weer op te bouwen; wat echt verandert, valt vanzelf weg).
 * Alleen labels van Klaro (iPhone, iPad, ...), nooit echte apparaatnamen.
 */
export interface Geleerd { k: string; laatst: string } // laatst: dag (JJJJ-MM-DD) waarop het nog uit de logboeken bleek

export const GELEERD_DAGEN = 90;

export const GELEERD: {
  /** apparaat|site die zichzelf ververst (widget, open tabblad): losse opvragingen zijn geen bezoek */
  auto: Geleerd[];
  /** sites die altijd met een hulpadres van een andere site meekomen (script van een websitebouwer) */
  helpers: Geleerd[];
  /** apparaat|cloud-adres|site: doorverwijs-adres van een app (zie followers() in lib/companion.ts) */
  followers: Geleerd[];
  /** site|adres: zelf geleerd bewijs dat een app echt open is (zie lib/selflearn.ts) */
  fg?: Geleerd[];
} = {
  auto: [
    { k: "Apple TV|google.com", laatst: "2026-10-19" },
    { k: "iPhone|google.com", laatst: "2026-10-19" },
    { k: "iPhone|onsoranje26.nl", laatst: "2026-10-19" },
    { k: "iPhone|voetbalkrant.com", laatst: "2026-10-19" },
    { k: "MacBook|canva.com", laatst: "2026-10-19" },
  ],
  helpers: [
    { k: "clouding17.com", laatst: "2026-10-19" },
    { k: "sugar-b.com", laatst: "2026-10-19" },
  ],
  followers: [
    { k: "Apple TV|a564.dscb.akamai.net|videoland.com", laatst: "2026-10-19" },
    { k: "Apple TV|d16w83149ahatb.cloudfront.net|videoland.com", laatst: "2026-10-19" },
    { k: "Apple TV|dualstack.dss-eu.map.fastly.net|disneyplus.com", laatst: "2026-10-19" },
    { k: "Apple TV|dualstack.j.sni.global.fastly.net|videoland.com", laatst: "2026-10-19" },
    { k: "Apple TV|f2.shared.global.fastly.net|videoland.com", laatst: "2026-10-19" },
    { k: "Apple TV|ftc-cr-delivery.dss.map.fastly.net|disneyplus.com", laatst: "2026-10-19" },
    { k: "iPad|a554.dscv.akamai.net|npo.nl", laatst: "2026-10-19" },
    { k: "iPad|a564.dscb.akamai.net|videoland.com", laatst: "2026-10-19" },
    { k: "iPad|budge-data-server-alb-prod-1279544458.us-west-2.elb.amazonaws.com|budgestudios.ca", laatst: "2026-10-19" },
    { k: "iPad|d22ykmcsp72ej5.cloudfront.net|npo.nl", laatst: "2026-10-19" },
    { k: "iPad|d2ql4livs4fn0v.cloudfront.net|npo.nl", laatst: "2026-10-19" },
    { k: "iPad|d6nwv1ijjxg0s.cloudfront.net|tocaboca.com", laatst: "2026-10-19" },
    { k: "iPad|dualstack.j.sni.global.fastly.net|videoland.com", laatst: "2026-10-19" },
    { k: "iPad|event-alb-23664651.eu-west-1.elb.amazonaws.com|tocaboca.com", laatst: "2026-10-19" },
    { k: "iPad|f2.shared.global.fastly.net|videoland.com", laatst: "2026-10-19" },
    { k: "iPad|scdnco.spotify.map.fastly.net|spotify.com", laatst: "2026-10-19" },
    { k: "iPad|tls13.spotifycdn.map.fastly.net|spotify.com", laatst: "2026-10-19" },
    { k: "iPad|x.sni.global.fastly.net|npo.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1272.dscg2.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1814.dscb.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1819.dscb.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1830.dscb.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1869.dscg2.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1883.dscb.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1936.dscb.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1952.dscb.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a1964.dscb.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|a233.dscb.akamai.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|e28241.dscb.akamaiedge.net|buienradar.nl", laatst: "2026-10-19" },
    { k: "iPhone|global.tls13.spotifycdn.map.fastly.net|spotify.com", laatst: "2026-10-19" },
    { k: "iPhone|main-d.contentful.map.fastly.net|meethue.com", laatst: "2026-10-19" },
    { k: "iPhone|scdnco.spotify.map.fastly.net|spotify.com", laatst: "2026-10-19" },
  ],
  fg: [],
};

/** Wat op `now` nog geldt. */
export function geldig(lijst: Geleerd[], now: number): string[] {
  return lijst.filter((x) => now - Date.parse(x.laatst + "T00:00:00Z") <= GELEERD_DAGEN * 86_400_000).map((x) => x.k);
}
