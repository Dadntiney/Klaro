/** Hulpjes voor de NextDNS-routes (tijd van de dag in Nederland, foutmeldingen). */

/** Begin van vandaag (Nederlandse tijd), of met `hours` alleen het laatste stuk ervan (om meteen iets te kunnen tonen). */
export function windowStart(hours: number, now = Date.now()): number {
  const dayStart = amsterdamMidnight(now);
  return hours > 0 ? Math.max(dayStart, now - hours * 3_600_000) : dayStart;
}

/** Middernacht (Nederlandse tijd) van de dag van `now`, ook goed op de dagen dat de klok verzet wordt. */
export function amsterdamMidnight(now: number): number {
  const p = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Amsterdam" }).formatToParts(now);
  const n = (x: string) => parseInt(p.find((q) => q.type === x)!.value, 10);
  const utcMidnight = Date.UTC(n("year"), n("month") - 1, n("day"));
  // Verschil met UTC rond middernacht (1 of 2 uur): twee keer bepalen, zodat een klokwissel die dag niet uitmaakt.
  const offset = (t: number) => {
    const z = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", timeZoneName: "longOffset" }).formatToParts(t).find((q) => q.type === "timeZoneName")?.value ?? "GMT+01:00";
    const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(z);
    return m ? (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? "0", 10)) * 60_000 : 3_600_000;
  };
  let t = utcMidnight - offset(utcMidnight);
  t = utcMidnight - offset(t);
  return t;
}

/** Foutmelding van NextDNS in gewone taal; de ruwe tekst blijft in de serverlog. */
export function nextdnsError(status: number, body = ""): string {
  if (body) console.error(`NextDNS ${status}: ${body.slice(0, 300)}`);
  if (status === 429) return "NextDNS: even te veel verzoeken. Het lukt over een minuutje weer.";
  if (status === 401 || status === 403) return `NextDNS gaf fout ${status}. Controleer de API-sleutel.`;
  if (status === 404) return "NextDNS gaf fout 404. Controleer het profiel-ID.";
  return `NextDNS gaf fout ${status}.`;
}
