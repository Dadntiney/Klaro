import { NextResponse } from "next/server";
import { baseDomain, extractHost, parseCsv } from "@/lib/parse";
import { classify, fgHit } from "@/lib/sites";
import { isEspHost, isMailClientHost } from "@/lib/mail";
import { anonId, deviceType, labelDevices } from "@/lib/names";
import { isSystemSite } from "@/lib/system";
import { GET as overview } from "../nextdns/route";
import { sameText } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Controle-overzicht voor de maandelijkse controle (alleen lezen, met een eigen sleutel: header `x-audit-token` = AUDIT_TOKEN).
 * Geeft geen echte apparaatnamen, alleen soorten (iPhone, iPad, ...). Bedoeld om gaten en vals alarm op te sporen:
 *  - risky: adressen met een verdacht woord die NIET rood zijn (mogelijke gaten in het vangnet)
 *  - flagged: alles wat wel rood is (mogelijk vals alarm)
 *  - unknownApps: veelgebruikte basisdomeinen die nergens zichtbaar worden (mogelijk een gemiste app, zoals F1 TV)
 *  - mailLike: adressen die op nieuwsbriefverkeer lijken maar niet als mail herkend worden
 *  - visible: zichtbare sites met hoeveel sessies echt gebruik waren (mogelijk achtergrond die toch zichtbaar is)
 */
export async function GET(req: Request) {
  const token = process.env.AUDIT_TOKEN;
  if (!token || token.length < 24 || !sameText(req.headers.get("x-audit-token") ?? "", token)) {
    return NextResponse.json({ error: "Geen toegang." }, { status: 401 });
  }
  const key = process.env.NEXTDNS_API_KEY;
  const profile = process.env.NEXTDNS_PROFILE_ID;
  if (!key || !profile) return NextResponse.json({ error: "Niet ingesteld." }, { status: 503 });

  // Het gewone overzicht tegelijk ophalen (scheelt de helft van de tijd).
  const ovP = overview(new Request("http://intern/api/nextdns")).then((r) => r.json()).catch(() => ({}));
  const res = await fetch(`https://api.nextdns.io/profiles/${encodeURIComponent(profile.trim())}/logs/download`, {
    headers: { "X-Api-Key": key.trim() },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(50_000),
  }).catch(() => null);
  if (!res || !res.ok) return NextResponse.json({ error: `NextDNS gaf fout ${res?.status ?? 0}.` }, { status: 502 });
  const rows = parseCsv(await res.text().catch(() => ""));
  if (rows.length < 2) return NextResponse.json({ error: "Geen logs ontvangen van NextDNS." }, { status: 502 });
  const [header, ...body] = rows;
  const col = (n: string) => header.findIndex((h) => h.trim().toLowerCase() === n);
  if (col("domain") < 0) return NextResponse.json({ error: "Geen domeinkolom in de NextDNS-logs gevonden." }, { status: 502 });
  const hostCol = col("domain"), tCol = col("timestamp"), idCol = col("device_id"), nameCol = col("device_name"), modelCol = col("device_model"), statusCol = col("status");
  const idOf = (r: string[]) => (idCol >= 0 && r[idCol]?.trim()) || (nameCol >= 0 && r[nameCol]?.trim() && anonId(r[nameCol].trim())) || "onbekend";
  const found = new Map<string, string>();
  for (const r of body) if (!found.has(idOf(r))) found.set(idOf(r), deviceType((nameCol >= 0 && r[nameCol]) || "", (modelCol >= 0 && r[modelCol]) || ""));
  const devName = labelDevices([...found].map(([id, type]) => ({ id, type })));

  const RISKY = /(sex|seks|porn|xxx|nude|naakt|nsfw|erot|escort|fetish|milf|hentai|onlyfans|fans|cam(s|girl|boy)|dating|date|flirt|single|hookup|tinder|vpn|proxy|unblock|doh|dns)/;
  const MAILY = /(^|\.)(e|em|email|mail|mailing|news|newsletter|nieuwsbrief|click|clicks|link|links|track|trk|ct|campaign|campaigns|crm|marketing)\./;
  type Stat = { n: number; devs: Set<string>; blocked: number };
  const risky = new Map<string, Stat>(), flagged = new Map<string, Stat & { flag: string }>(), bases = new Map<string, Stat & { hosts: Map<string, number> }>(), mailLike = new Map<string, Stat>();
  let minT = Infinity, maxT = 0;
  const add = <T extends Stat>(m: Map<string, T>, k: string, dev: string, blocked: boolean, init: () => T) => {
    const s = m.get(k) ?? init();
    s.n++;
    s.devs.add(dev);
    if (blocked) s.blocked++;
    m.set(k, s);
    return s;
  };
  for (const r of body) {
    const host = extractHost(r[hostCol] ?? "");
    if (!host) continue;
    const t = tCol >= 0 ? Date.parse(r[tCol]) || 0 : 0;
    if (t) { minT = Math.min(minT, t); maxT = Math.max(maxT, t); }
    const dev = devName[idOf(r)];
    const blocked = (statusCol >= 0 ? r[statusCol] ?? "" : "").trim().toLowerCase() === "blocked";
    const info = classify(host);
    if (info.flag) add(flagged, host, dev, blocked, () => ({ n: 0, devs: new Set(), blocked: 0, flag: info.flag! }));
    else if (RISKY.test(host)) add(risky, host, dev, blocked, () => ({ n: 0, devs: new Set(), blocked: 0 }));
    if (!info.flag && MAILY.test(host) && !isEspHost(host) && !isMailClientHost(host)) add(mailLike, host, dev, blocked, () => ({ n: 0, devs: new Set(), blocked: 0 }));
    if (!info.flag && !info.main && !info.bg && fgHit(info.site, host) === undefined && !isSystemSite(baseDomain(host))) {
      const s = add(bases, info.site, dev, blocked, () => ({ n: 0, devs: new Set(), blocked: 0, hosts: new Map() }));
      s.hosts.set(host, (s.hosts.get(host) ?? 0) + 1);
    }
  }
  const out = <T extends Stat>(m: Map<string, T>, n: number, extra?: (k: string, s: T) => object) =>
    [...m].sort((a, b) => b[1].n - a[1].n).slice(0, n).map(([k, s]) => ({ k, n: s.n, devs: [...s.devs], blocked: s.blocked, ...(extra ? extra(k, s) : {}) }));

  // Zichtbare sites uit het gewone overzicht: hoeveel sessies tellen als echt gebruik.
  const ov = (await ovP) as { groups?: { site: string; dev: string; main: boolean; bg: boolean; flag?: string; ss?: { s: number; e: number; n?: number; m?: number; f?: number; ml?: number }[] }[] };
  const vis = new Map<string, { sessions: number; mail: number; fgApp: boolean; devs: Set<string> }>();
  for (const g of ov.groups ?? []) {
    if (g.bg || !g.main || g.flag) continue;
    const v = vis.get(g.site) ?? { sessions: 0, mail: 0, fgApp: false, devs: new Set<string>() };
    for (const x of g.ss ?? []) {
      v.sessions++;
      if (x.ml) v.mail++;
      if (x.f !== undefined) v.fgApp = true;
    }
    v.devs.add(g.dev);
    vis.set(g.site, v);
  }

  return NextResponse.json({
    period: { from: Number.isFinite(minT) ? new Date(minT).toISOString() : null, to: maxT ? new Date(maxT).toISOString() : null, rows: body.length },
    risky: out(risky, 150),
    flagged: out(flagged, 150, (_, s) => ({ flag: s.flag })),
    unknownApps: out(bases, 100, (_, s) => ({ hosts: [...s.hosts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h, c]) => `${h} (${c})`) })),
    mailLike: out(mailLike, 100),
    visible: [...vis].sort((a, b) => b[1].sessions - a[1].sessions).slice(0, 200).map(([site, v]) => ({ site, sessions: v.sessions, mail: v.mail, fgApp: v.fgApp, devs: [...v.devs] })),
  });
}
