/**
 * Wat er als echt gebruik in de lijst komt, en hoeveel minuten dat per apparaat is. Eén plek voor de pagina (app/page.tsx) en
 * het weekbericht (scripts/waarschuw.ts), zodat de minuten overal precies hetzelfde zijn.
 */
import { isHuman, type Session } from "./sessions.ts";
import { HEARTBEAT_GAP, NAV_APPS, NAV_GAP } from "./sites.ts";
import { isPlainSite, isSystemSite } from "./system.ts";
import { isMailSession } from "./mail.ts";
import { ALWAYS_SHOW, ALWAYS_SHOW_OPEN, isTv, tvBlipper, type LiveGroup } from "./livestatus.ts";

export type UseGroup = LiveGroup & { last: number; susp?: string };
export type MailTimes = Map<string, { esp: number[]; mc: number[] }>;

export function usage<G extends UseGroup>(groups: G[], o: { auto: Set<string>; followers: Record<string, string>; mailT?: MailTimes; cut?: number }) {
  const mailT = o.mailT ?? new Map();
  // Echt gebruik: geen sessie uit een geopende mail (de server markeert die; live aangevulde sessies controleren we hier).
  const blip = tvBlipper(groups);
  const human = (g: G, x: Session) => isHuman(x) && !blip(g, x) && !(x.pv && !x.lg && o.auto.has(g.dev + "|" + g.site)) && !(isPlainSite(g) && mailT.get(g.dev) && !x.ck && !x.lg && isMailSession(x, mailT.get(g.dev)!.esp, mailT.get(g.dev)!.mc));
  // Sessies van zichtbare sites per apparaat: een app zonder eigen www-adres (zoals Buienradar) telt alleen als er geen zichtbaar bezoek tegelijk speelde.
  const visSes = new Map<string, Session[]>();
  const visBy = new Map<string, { s: number; site: string }[]>(); // per apparaat: begin van elk zichtbaar bezoek, met de site
  for (const g of groups) {
    if (g.bg || !g.main) continue;
    for (const x of g.ss ?? []) if (g.flag || g.susp || human(g, x)) {
      (visSes.get(g.dev) ?? visSes.set(g.dev, []).get(g.dev)!).push(x);
      (visBy.get(g.dev) ?? visBy.set(g.dev, []).get(g.dev)!).push({ s: x.s, site: g.site });
    }
  }
  const standalone = (g: G, x: Session) =>
    (x.n ?? 0) >= 3 && !x.ml && !x.res && !(visSes.get(g.dev) ?? []).some((v) => v.s <= x.e + 60_000 && v.e >= x.s - 60_000);
  /** Hoort deze site in de lijst (voordat naar de sessies gekeken wordt)? */
  const listed = (g: G) => {
    if (g.bg) return false;
    if (!g.main && (isSystemSite(g.site) || !(g.ss ?? []).some((x) => standalone(g, x)))) return false;
    if ((g.bl ?? 0) >= g.n && !g.flag) return false; // alles geblokkeerd door NextDNS: niet bezocht
    return true;
  };
  // Apps met een vaste melding via een doorverwijs-adres, als "apparaat|site" (één keer opbouwen, niet per groep doorzoeken).
  const followed = new Set(Object.entries(o.followers).map(([k, site]) => k.slice(0, k.indexOf("|")) + "|" + site));
  const cache = new Map<G, Session[]>();
  // Welke sessies van een site tellen als echt gebruik: één plek, zodat de lijst en het dagtotaal precies hetzelfde laten zien.
  const shown = (g: G): Session[] => {
    const hit = cache.get(g);
    if (hit) return hit;
    const r = shownRaw(g);
    cache.set(g, r);
    return r;
  };
  const shownRaw = (g: G): Session[] => {
    let all = g.ss && g.ss.length ? g.ss : [{ s: g.last, e: g.last }];
    // Navigatie (Waze) en apps met een vaste melding (Toca Boca): stukjes met hooguit NAV_GAP / HEARTBEAT_GAP ertussen zijn één
    // rit of één keer spelen, ook live (zelfde regel als lib/overview.ts).
    const joinGap = NAV_APPS.has(g.site) ? NAV_GAP : followed.has(g.dev + "|" + g.site) ? HEARTBEAT_GAP : 0;
    if (joinGap && all.length > 1) {
      const m: Session[] = [];
      for (const x of [...all].sort((a, b) => a.s - b.s)) { const l = m[m.length - 1]; if (l && x.s - l.e <= joinGap) m[m.length - 1] = { ...l, e: Math.max(l.e, x.e), n: (l.n ?? 1) + (x.n ?? 1) }; else m.push({ ...x }); }
      all = m.reverse();
    }
    // Gemarkeerde en verdachte regels blijven altijd staan.
    const ss = all.filter((x) => (!o.cut || x.s >= o.cut) && (g.main ? g.flag || g.susp || (ALWAYS_SHOW.has(g.site) && (!ALWAYS_SHOW_OPEN[g.site] || !!x.op)) || human(g, x) : standalone(g, x)));
    if (!isTv(g.dev) || ss.length < 2) return ss;
    // Op een tv is kijken één geheel: stukjes van dezelfde app met minder dan 15 minuten ertussen samenvoegen
    // (tijdens het kijken vraagt de tv maar af en toe iets op, waardoor er anders losse regels ontstaan).
    const out: Session[] = [];
    for (const x of [...ss].sort((a, b) => a.s - b.s)) {
      const last = out[out.length - 1];
      // Niet samenvoegen als er tussendoor een andere app op deze tv gebruikt is (F1 TV, dan YouTube: YouTube is een nieuw bezoek).
      const other = last && (visBy.get(g.dev) ?? []).some((v) => v.site !== g.site && v.s > last.e && v.s < x.s);
      if (last && !other && x.s - last.e <= 15 * 60_000) out[out.length - 1] = { ...last, e: Math.max(last.e, x.e), n: (last.n ?? 1) + (x.n ?? 1), m: (last.m ?? 0) + (x.m ?? 0) };
      else out.push({ ...x });
    }
    return out.reverse();
  };
  return { listed, shown };
}

/** Actieve minuten: de echte-gebruik-sessies van één apparaat samengevoegd (overlappende apps niet dubbel). */
export function activeMinutes(ss: Session[]): number {
  const iv = ss.map((x) => [x.s, x.e]).sort((p, q) => p[0] - q[0]);
  let mins = 0, cs = -1, ce = -1;
  for (const [s0, e0] of iv) {
    if (s0 > ce) { if (ce > cs) mins += (ce - cs) / 60_000; cs = s0; ce = e0; } else ce = Math.max(ce, e0);
  }
  if (ce > cs) mins += (ce - cs) / 60_000;
  return mins;
}
