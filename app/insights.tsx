"use client";

import { useMemo, useState } from "react";
import type { Device, Group, Insights, PayMoment } from "./types";
import { DevIcon, dayKeyFmt, dayLabel, dayStartMs, dur, isNight, shortDayFmt, sumMin, timeFmt } from "./ui";
import { minutes } from "@/lib/sessions";

const DAY = 86_400_000;

interface Item {
  icon: string;
  text: string;
  level: 1 | 2 | 3; // 1 = let op, 2 = let goed op, 3 = gevaar
}

interface Props {
  groups: Group[];
  devices: Device[];
  insights: Insights | null;
  payments: PayMoment[];
  device: string | null;
  tick: number;
}

/** Uitleg in gewone taal bij een verdacht adres. */
function plainReason(reason: string): string {
  if (reason.startsWith("lijkt op")) return "lijkt op een nep-website";
  if (reason.startsWith("willekeurige")) return "heeft een raar adres";
  if (reason.startsWith("lokwoorden")) return "lokt met gratis dingen";
  return "ziet er niet veilig uit";
}

function plainFlag(flag: string): string {
  if (flag === "18+") return "een website voor volwassenen";
  if (flag === "Dating") return "een datingwebsite";
  if (flag === "VPN/proxy") return "een VPN (die verbergt wat je doet)";
  if (flag === "Geblokkeerd") return "een website voor volwassenen (is tegengehouden)";
  return flag;
}

function plainPay(kind: string): string {
  if (kind === "iDEAL") return "betaald via de bank (iDEAL)";
  if (kind === "PayPal") return "PayPal geopend om te betalen";
  return "een betaalpagina van een webshop geopend";
}

export default function InsightsView({ groups, devices, insights, payments, device, tick }: Props) {
  const now = Date.now();
  const today = dayKeyFmt.format(now);
  const devs = devices.filter((d) => !device || d.name === device);
  const inScope = (name: string) => !device || name === device;
  const [showTimes, setShowTimes] = useState(false);
  const [showDays, setShowDays] = useState(false);

  // ---- Is alles in orde?
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const t0 = Date.parse(today);

    for (const g of groups) {
      if (g.flag && g.d === today && inScope(g.dev)) out.push({ icon: "🚨", level: 3, text: `${g.dev} heeft ${plainFlag(g.flag)} bezocht (${g.name}).` });
    }
    for (const g of groups) {
      if (g.susp && g.isNew && g.main && !g.bg && inScope(g.dev)) out.push({ icon: "⚠️", level: 3, text: `${g.dev} is naar ${g.site} gegaan. Die website ${plainReason(g.susp)}. Niet aanklikken!` });
    }
    for (const p of payments) {
      if (p.level === "checkout" && now - p.t < DAY && inScope(p.dev)) out.push({ icon: "💳", level: 2, text: `${p.dev} heeft om ${timeFmt.format(p.t)} ${plainPay(p.kind)}.` });
    }
    for (const d of devices) {
      if (d.first && now - d.first < DAY && (insights?.since ?? 0) && now - (insights?.since ?? 0) > 3 * DAY && inScope(d.name)) out.push({ icon: "📱", level: 2, text: `Er is een nieuw apparaat bijgekomen: ${d.name}.` });
    }
    for (const d of devs) {
      if ((d.threats?.today ?? 0) > 0) out.push({ icon: "🛡️", level: 2, text: `${d.name}: ${d.threats!.today} gevaarlijke websites zijn tegengehouden.` });
    }
    for (const d of devs) {
      const night = (d.ss ?? []).filter((x) => minutes(x) >= 2 && (isNight(x.s) || isNight(x.e)));
      if (night.length) out.push({ icon: "🌙", level: 2, text: `${d.name} stond 's nachts aan (om ${timeFmt.format(night[0].s)}).` });
    }
    // veel meer dan normaal, of weer gebruikt na lange tijd
    const bySite = new Map<string, Group[]>();
    for (const g of groups) if (g.main && !g.bg && inScope(g.dev)) (bySite.get(g.dev + "|" + g.site) ?? bySite.set(g.dev + "|" + g.site, []).get(g.dev + "|" + g.site)!).push(g);
    for (const list of bySite.values()) {
      const cur = list.find((g) => g.d === today);
      if (!cur) continue;
      const prev = list.filter((g) => g.d !== today && (g.mins ?? 0) > 0);
      if (prev.length >= 3) {
        const avg = prev.reduce((n, g) => n + (g.mins ?? 0), 0) / prev.length;
        if ((cur.mins ?? 0) >= 20 && (cur.mins ?? 0) >= 3 * avg) out.push({ icon: "📈", level: 1, text: `${cur.name} is op de ${cur.dev} veel langer gebruikt dan normaal (${dur(cur.mins!)}).` });
      }
      const older = list.filter((g) => g.d !== today);
      if (older.length && !cur.isNew && (cur.mins ?? 0) >= 1) {
        const gap = Math.round((t0 - Math.max(...older.map((g) => Date.parse(g.d)))) / DAY);
        if (gap >= 7) out.push({ icon: "🔁", level: 1, text: `${cur.name} is voor het eerst weer gebruikt na ${gap} dagen (${cur.dev}).` });
      }
    }
    for (const d of devs) {
      const runs = (d.away?.runs ?? []).filter((r) => r.e >= t0);
      if (runs.length) out.push({ icon: "📍", level: 1, text: `${d.name} was even niet thuis (van ${timeFmt.format(runs[0].s)} tot ${timeFmt.format(runs[0].e)}).` });
    }
    const fresh = [...new Set(groups.filter((g) => g.isNew && g.main && !g.bg && !g.susp && (g.bl ?? 0) < g.n && inScope(g.dev)).map((g) => g.name))];
    if (fresh.length) out.push({ icon: "✨", level: 1, text: `Nieuw vandaag: ${fresh.slice(0, 4).join(", ")}${fresh.length > 4 ? ` en ${fresh.length - 4} meer` : ""}.` });
    return out.sort((a, b) => b.level - a.level).slice(0, 7);
  }, [groups, devices, payments, device, today, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const worst = items.reduce((m, i) => Math.max(m, i.level), 0);
  const status = worst >= 3 ? { icon: "🚨", title: "Let goed op", cls: "red" } : worst === 2 ? { icon: "👀", title: "Let even op", cls: "orange" } : worst === 1 ? { icon: "🙂", title: "Bijna alles is in orde", cls: "green" } : { icon: "😊", title: "Alles is in orde", cls: "green" };

  // ---- Hoe lang aan?
  const dayStart = dayStartMs(now);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - dayStart) / DAY) * 100));
  const mins = (d: Device) => sumMin(d.ss ?? []);
  const maxMin = Math.max(30, ...devs.map(mins));
  const topApps = (name: string) =>
    groups
      .filter((g) => g.d === today && g.dev === name && g.main && !g.bg && (g.mins ?? 0) > 0 && (g.bl ?? 0) < g.n)
      .sort((a, b) => (b.mins ?? 0) - (a.mins ?? 0))
      .slice(0, 2);

  // ---- Slapen
  const sleepDays = useMemo(() => {
    const set = new Set<string>();
    for (const d of devs) for (const s of d.sleep ?? []) set.add(s.d);
    return [...set].sort((a, b) => (a < b ? 1 : -1)).slice(0, 7);
  }, [devs]);
  const yesterday = dayKeyFmt.format(now - DAY);

  // ---- Betalen
  const checkouts = payments.filter((p) => p.level === "checkout" && inScope(p.dev));
  const store = payments.filter((p) => p.level === "store" && inScope(p.dev));

  // ---- Veilig?
  const suspicious = groups
    .filter((g) => g.susp && g.main && !g.bg && inScope(g.dev) && now - g.last < 7 * DAY)
    .sort((a, b) => b.last - a.last)
    .slice(0, 4);
  const withThreats = devs.filter((d) => (d.threats?.week ?? 0) > 0);
  const awayNow = devs.filter((d) => d.away?.now);

  // ---- Echt gekeken
  const media = groups
    .filter((g) => g.d === today && (g.mm ?? 0) > 0 && g.main && !g.bg && inScope(g.dev))
    .sort((a, b) => (b.mm ?? 0) - (a.mm ?? 0))
    .slice(0, 5);

  const trackers = insights?.trackers ?? [];
  const maxTr = Math.max(1, ...trackers.map((t) => t.n));

  return (
    <div className="insights kids">
      <section className={"card status " + status.cls}>
        <div className="status-head">
          <span className="status-icon">{status.icon}</span>
          <h3>{status.title}</h3>
        </div>
        {items.length === 0 ? (
          <p className="k-text">Er is vandaag niets vreemds gezien.</p>
        ) : (
          items.map((l, i) => (
            <div className="k-note" key={i}>
              <span className="ni">{l.icon}</span>
              <span>{l.text}</span>
            </div>
          ))
        )}
      </section>

      <section className="card">
        <h3>⏱️ Hoe lang aan vandaag?</h3>
        {devs.map((d) => (
          <div className="k-dev" key={d.name}>
            <div className="k-devhead">
              <span className="dev big"><DevIcon name={d.name} />{d.name}</span>
              <b>{mins(d) > 0 ? dur(mins(d)) : "niet gebruikt"}</b>
            </div>
            <div className="k-bar"><span style={{ width: `${(mins(d) / maxMin) * 100}%` }} /></div>
            {topApps(d.name).length > 0 && <div className="k-sub">Het meest: {topApps(d.name).map((g) => `${g.name} (${dur(g.mins ?? 0)})`).join(", ")}</div>}
            {showTimes && (
              <>
                <div className="strip night">
                  {(d.ss ?? []).map((x, i) => (
                    <span key={i} className="seg" style={{ left: `${pct(x.s)}%`, width: `${Math.max(0.8, pct(x.e) - pct(x.s))}%` }} />
                  ))}
                  <span className="nowline" style={{ left: `${pct(now)}%` }} />
                </div>
                {(d.away?.runs ?? []).some((r) => r.e >= dayStart) && (
                  <div className="strip thin">
                    {(d.away?.runs ?? []).filter((r) => r.e >= dayStart).map((x, i) => (
                      <span key={i} className="seg away" style={{ left: `${pct(x.s)}%`, width: `${Math.max(0.8, pct(x.e) - pct(x.s))}%` }} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {showTimes && (
          <>
            <div className="k-times"><span>nacht</span><span>ochtend</span><span>middag</span><span>avond</span></div>
            <p className="k-sub">Paars = aan. Grijs streepje = niet thuis. Het streepje is nu.</p>
          </>
        )}
        <button className="k-more" onClick={() => setShowTimes(!showTimes)}>{showTimes ? "Verberg de tijden" : "Op welke tijden? ›"}</button>
      </section>

      <section className="card">
        <h3>🌙 Wanneer ging het uit?</h3>
        {devs.map((d) => {
          const t = (d.sleep ?? []).find((x) => x.d === today);
          const y = (d.sleep ?? []).find((x) => x.d === yesterday);
          const nightLate = (d.sleep ?? []).slice(0, 3).some((x) => isNight(x.first) || isNight(x.last));
          return (
            <div className="k-note" key={d.name}>
              <span className="ni"><DevIcon name={d.name} /></span>
              <span>
                <b>{d.name}</b>:{" "}
                {y ? `gisteren aan van ${timeFmt.format(y.first)} tot ${timeFmt.format(y.last)}` : "gisteren niet gebruikt"}
                {t ? `. Vandaag aan vanaf ${timeFmt.format(t.first)}.` : "."}
                {nightLate && <span className="k-warn"> Let op: soms ook 's nachts aan.</span>}
              </span>
            </div>
          );
        })}
        {sleepDays.length > 1 && (
          <>
            {showDays && (
              <div className="sleep">
                <div className="srow head">
                  <span />
                  {devs.map((d) => <span key={d.name}>{d.name}</span>)}
                </div>
                {sleepDays.map((day) => (
                  <div className="srow" key={day}>
                    <span className="muted">{day === today ? "Vandaag" : shortDayFmt.format(new Date(day + "T12:00:00Z"))}</span>
                    {devs.map((d) => {
                      const s = (d.sleep ?? []).find((x) => x.d === day);
                      if (!s) return <span key={d.name} className="muted">–</span>;
                      const late = isNight(s.last) || isNight(s.first);
                      return (
                        <span key={d.name} className={late ? "late" : ""}>
                          {timeFmt.format(s.first)}<br />{timeFmt.format(s.last)}{late ? " 🌙" : ""}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <button className="k-more" onClick={() => setShowDays(!showDays)}>{showDays ? "Verberg de dagen" : "Alle dagen bekijken ›"}</button>
          </>
        )}
      </section>

      <section className="card">
        <h3>💳 Is er iets gekocht?</h3>
        {checkouts.length === 0 ? (
          <p className="k-ok">✓ Nee, er is niets gekocht.</p>
        ) : (
          checkouts.slice(0, 5).map((p, i) => (
            <div className="k-note" key={i}>
              <span className="ni">💳</span>
              <span>{dayLabel(dayKeyFmt.format(p.t))} om {timeFmt.format(p.t)}: <b>{p.dev}</b> heeft {plainPay(p.kind)}.</span>
            </div>
          ))
        )}
        {store.length > 0 && <p className="k-sub">De App Store is {store.length}× gebruikt. Dat gaat vaak vanzelf (bijvoorbeeld voor updates), dus dat is meestal geen aankoop.</p>}
      </section>

      <section className="card">
        <h3>🛡️ Is het veilig?</h3>
        {withThreats.length === 0 ? (
          <p className="k-ok">✓ Er zijn geen gevaarlijke websites geprobeerd.</p>
        ) : (
          withThreats.map((d) => (
            <div className="k-note" key={d.name}>
              <span className="ni">🛡️</span>
              <span><b>{d.name}</b>: {d.threats!.week} gevaarlijke websites zijn tegengehouden deze week. Dat is goed: ze zijn niet geopend.</span>
            </div>
          ))
        )}
        {suspicious.map((g) => (
          <div className="k-note" key={g.d + g.site + g.dev}>
            <span className="ni">⚠️</span>
            <span><b>{g.site}</b> ({g.dev}, {dayLabel(g.d).toLowerCase()}) {plainReason(g.susp!)}. Liever niet openen.</span>
          </div>
        ))}
        <div className="k-note">
          <span className="ni">📍</span>
          <span>
            {awayNow.length === 0 ? "Alles is thuis." : awayNow.map((d) => `${d.name} is niet thuis (sinds ${timeFmt.format(d.away!.since)})`).join(". ") + "."}
          </span>
        </div>
      </section>

      <section className="card">
        <h3>🎬 Wat is echt gekeken?</h3>
        {media.length === 0 ? (
          <p className="k-text">Vandaag geen filmpjes of plaatjes gezien.</p>
        ) : (
          media.map((g) => (
            <div className="k-note" key={g.site + g.dev}>
              <span className="ni">▶️</span>
              <span><b>{g.name}</b> op de {g.dev}: ongeveer {dur(g.mm ?? 0)} filmpjes of plaatjes.</span>
            </div>
          ))
        )}
      </section>

      <section className="card">
        <h3>🕵️ Wie wil je volgen?</h3>
        <p className="k-sub" style={{ marginTop: 0 }}>Deze apps willen veel weten over wat je doet. NextDNS houdt dat tegen.</p>
        {trackers.length === 0 ? <p className="k-text">Geen gegevens.</p> : trackers.slice(0, 5).map((t) => (
          <div className="bar-row" key={t.site}>
            <span className="bn">{t.name}</span>
            <span className="bt"><span className="bf" style={{ width: `${(t.n / maxTr) * 100}%` }} /></span>
            <span className="bv">{t.n.toLocaleString("nl-NL")}×</span>
          </div>
        ))}
      </section>
    </div>
  );
}
