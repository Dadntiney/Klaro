"use client";

import { useState } from "react";
import { hourOf } from "./ui";

/** Favicon, of niets (een leeg vakje voor de uitlijning) als de site er geen heeft. */
/** WhatsApp zoals het app-icoon: groen vlak met wit logo. Het favicon (groen lijntje op wit) is in donker slecht te zien. */
export function WhatsAppIcon() {
  return (
    <svg className="fav ok" viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#25D366" />
      <path d="M16 6.6a9.4 9.4 0 0 0-8.1 14.2L6.6 25.4l4.7-1.2A9.4 9.4 0 1 0 16 6.6z" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round" />
      {/* telefoontje precies in het midden van de ballon (16,16) */}
      <path fill="#fff" transform="translate(-1.76 -0.29)" d="M12.6 11.3c.3-.6.6-.6.9-.6h.7c.2 0 .5 0 .7.6l.9 2.1c.1.2.1.5 0 .7l-.6.8c-.2.2-.2.4 0 .7.9 1.5 2 2.5 3.5 3.3.3.1.5.1.7-.1l.8-.9c.2-.2.4-.3.7-.2l2 .9c.3.1.5.3.5.6 0 .8-.3 1.7-.9 2.1-.7.5-1.6.7-2.6.5-1.5-.4-3.3-1.3-4.8-2.9-1.6-1.6-2.6-3.4-2.9-4.9-.2-1 0-1.7.4-2.2z" />
    </svg>
  );
}

/** Naam zonder "(spel)"/"(leren)": dat staat als woordje in de tweede regel, zodat de naam niet afgekapt wordt. */
export const shortName = (name: string) => name.replace(/ \((spel|leren)\)$/, "");
export const kindOf = (name: string) => / \((spel|leren)\)$/.exec(name)?.[1];

/** Spelletje (handcontroller), voor een spel of leer-app zonder logo: rustiger dan een losse letter. */
export function GameGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 15h-4l-1 .6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4z" />
      <path d="M7 11v3M5.5 12.5h3" />
      <circle cx="16" cy="12" r=".6" fill="currentColor" />
      <circle cx="18" cy="13.5" r=".6" fill="currentColor" />
    </svg>
  );
}

/**
 * Favicon; heeft een site er geen, dan een rustig grijs vakje (een spelletje bij een spel, anders de beginletter), zodat alles
 * uitgelijnd blijft. Bij een app (eigen naam in Klaro) zoekt de server zonder logo op de website het icoon in de App Store.
 */
export function Favicon({ domain, name, app }: { domain: string; name: string; app?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const initial = (name.replace(/^www\./, "")[0] ?? "?").toUpperCase();
  if (/(^|\.)whatsapp\.(com|net)$/.test(domain)) return <WhatsAppIcon />;
  return (
    <>
      {state !== "ok" && <span className="fav ph" aria-hidden>{/ \((spel|leren)\)$/.test(name) ? <GameGlyph /> : initial}</span>}
      {state !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={state === "ok" ? "fav ok" : "fav-hidden"}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          // Via de eigen server (api/icon.php). Heeft een site geen icoon, dan is het een wereldbolletje van 16x16: dat tonen we niet.
          src={`/api/icon.php?d=${encodeURIComponent(domain)}&s=64${app ? `&n=${encodeURIComponent(name)}` : ""}`}
          onLoad={(e) => setState(e.currentTarget.naturalWidth > 16 ? "ok" : "none")}
          onError={() => setState("none")}
        />
      )}
    </>
  );
}

/** Terug naar een moment (dag en tijd): klokje met een pijltje terug. */
export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Dagdelen in de lijst: nacht 0-6, ochtend 6-12, middag 12-18, avond 18-24 uur. */
export const PARTS = ["Nacht", "Ochtend", "Middag", "Avond"] as const;
export const partOf = (t: number) => Math.floor(hourOf(t) / 6);
export function PartIcon({ p }: { p: number }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p === 0 && <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />}
      {p === 2 && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      {(p === 1 || p === 3) && <><path d="M17 18a5 5 0 0 0-10 0" /><path d="M2 18h20M12 9V3M4.2 10.2l1.4 1.4M18.4 11.6l1.4-1.4M7 21h10" />{p === 1 ? <path d="M9 6l3-3 3 3" /> : <path d="M9 4l3 3 3-3" />}</>}
    </svg>
  );
}

/** Niet via thuis-wifi (mobiele data of een andere wifi): de streepjes van mobiel, zelfde icoontje als bij de regels (wens
 *  eigenaar 28 okt, na huisje met pijl, wifi-teken en wereldbol). */
export function OutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 19v-3M10 19v-6M15 19v-9M20 19V7" />
    </svg>
  );
}

/** Alle losse DNS-regels (logboek): streepjes met een stipje ervoor. */
export function LogIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Van wie is een adres, voor het logo (zoals NextDNS het toont): technische adressen van grote bedrijven krijgen het logo van
 * de eigenaar (aaplimg.com → Apple, googleapis.com → Google). Anders het logo van de app/site waar Klaro het adres bij zet
 * (maps.meteoplaza.com → Buienalarm), en anders van het adres zelf.
 */
export const LOGO_OWNER: [RegExp, string][] = [
  [/(^|\.)(aaplimg\.com|apple-dns\.net|apple\.news|icloud-content\.com|mzstatic\.com|cdn-apple\.com)$|push-apple\.com\.akadns\.net$|apple.*\.akadns\.net$/, "apple.com"],
  [/(^|\.)(googleapis\.com|gstatic\.com|gvt[12]\.com|googleusercontent\.com|1e100\.net|app-measurement\.com|google-analytics\.com|googletagmanager\.com|googlesyndication\.com|doubleclick\.net|app-ads-services\.com|app-analytics-services\.com|crashlytics\.com)$/, "google.com"],
  [/(^|\.)(akamai\.net|akamaiedge\.net|akamaihd\.net|akamaized\.net|akadns\.net|edgekey\.net|edgesuite\.net|akahost\.net)$/, "akamai.com"],
  [/(^|\.)(cloudfront\.net|amazonaws\.com)$/, "aws.amazon.com"],
  [/(^|\.)(fbcdn\.net|facebook\.net)$/, "facebook.com"],
  [/(^|\.)(msedge\.net|azureedge\.net|azurefd\.net|trafficmanager\.net|office\.net|cloudapp\.azure\.com|msftauth\.net|msauth\.net)$/, "microsoft.com"],
  [/(^|\.)(fastly\.net|fastlylb\.net)$/, "fastly.com"],
  [/(^|\.)(cloudflare\.net|cloudflare-dns\.com)$/, "cloudflare.com"],
];
export function logoDomain(host: string, base: string, icon?: string): string {
  for (const [re, owner] of LOGO_OWNER) if (re.test(host)) return owner;
  return icon && icon !== base && icon.includes(".") ? icon : base;
}

/** Klein logo voor de NextDNS-weergave; zonder logo een rustig bolletje in plaats van een letter. */
export function MiniFav({ domain }: { domain: string }) {
  const [ok, setOk] = useState<boolean | null>(null);
  return (
    <span className="mfav" aria-hidden>
      {ok !== false && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={ok ? "ok" : ""}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          src={`/api/icon.php?d=${encodeURIComponent(domain)}&s=32`}
          onLoad={(e) => setOk(e.currentTarget.naturalWidth > 16)}
          onError={() => setOk(false)}
        />
      )}
    </span>
  );
}
