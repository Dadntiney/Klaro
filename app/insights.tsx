"use client";

import { useMemo } from "react";
import type { Device, Group, Insights, PayMoment } from "./types";
import { DevIcon, dayKeyFmt, dayLabel, dayStartMs, dur, isNight, shortDayFmt, sumMin, timeFmt } from "./ui";
import { minutes } from "@/lib/sessions";

const DAY = 86_400_000;
const COUNTRY: Record<string, string> = { NL: "Nederland", US: "Verenigde Staten", IE: "Ierland", DE: "Duitsland", FR: "Frankrijk", GB: "Verenigd Koninkrijk", CA: "Canada", SE: "Zweden", PL: "Polen", KR: "Zuid-Korea", CH: "Zwitserland", BE: "België", IT: "Italië", ES: "Spanje", ZA: "Zuid-Afrika", AU: "Australië", HU: "Hongarije", SG: "Singapore", BR: "Brazilië", RU: "Rusland", CN: "China", HK: "Hongkong", IN: "India", TR: "Turkije", UA: "Oekraïne" };
const country = (cc?: string) => (cc ? COUNTRY[cc] ?? cc : "");

interface Line {
  icon: string;
  text: string;
  level: number; // hoger = belangrijker
}

interface Props {
  groups: Group[];
  devices: Device[];
  insights: Insights | null;
  payments: PayMoment[];
  device: string | null;
  tick: number;
}

export default function InsightsView({ groups, devices, insights, payments, device, tick }: Props) {
  const now = Date.now();
  const today = dayKeyFmt.format(now);
  const devs = devices.filter((d) => !device || d.name === device);
  const inScope = (name: string) => !device || name === device;

  // ---- Opvallend vandaag
  const notable = useMemo<Line[]>(() => {
    const lines: Line[] = [];
    const t0 = Date.parse(today);

    for (const p of payments) {
      if (p.level === "checkout" && now - p.t < DAY && inScope(p.dev)) lines.push({ icon: "💳", level: 100, text: `${p.dev} · ${timeFmt.format(p.t)}: afrekenen via ${p.kind}` });
    }
    for (const g of groups) {
      if (g.susp && g.isNew && g.main && !g.bg && inScope(g.dev)) lines.push({ icon: "⚠", level: 90, text: `${g.dev}: nieuw adres ${g.site} (${g.susp})${g.cc ? ` · server in ${country(g.cc)}` : ""}` });
    }
    for (const d of devices) {
      if (d.first && now - d.first < DAY && (insights?.since ?? 0) && now - (insights?.since ?? 0) > 3 * DAY && inScope(d.name)) lines.push({ icon: "📱", level: 85, text: `Nieuw apparaat in NextDNS: ${d.name} (voor het eerst gezien om ${timeFmt.format(d.first)})` });
    }
    for (const d of devs) {
      if ((d.threats?.today ?? 0) > 0) lines.push({ icon: "⚠", level: 80, text: `${d.name}: ${d.threats!.today}× een bekende kwaadaardige site geblokkeerd vandaag` });
    }
    for (const d of devs) {
      const night = (d.ss ?? []).filter((x) => isNight(x.s) || isNight(x.e));
      if (night.length) lines.push({ icon: "🌙", level: 70, text: `${d.name}: actief 's nachts (${night.slice(0, 2).map((x) => timeFmt.format(x.s)).join(", ")})` });
    }
    // afwijkend gebruik: veel meer dan normaal, of weer gebruikt na lange tijd
    const bySite = new Map<string, Group[]>();
    for (const g of groups) if (g.main && !g.bg && inScope(g.dev)) (bySite.get(g.dev + "|" + g.site) ?? bySite.set(g.dev + "|" + g.site, []).get(g.dev + "|" + g.site)!).push(g);
    for (const list of bySite.values()) {
      const cur = list.find((g) => g.d === today);
      if (!cur) continue;
      const prev = list.filter((g) => g.d !== today && (g.mins ?? 0) > 0);
      if (prev.length >= 3) {
        const avg = prev.reduce((n, g) => n + (g.mins ?? 0), 0) / prev.length;
        if ((cur.mins ?? 0) >= 20 && (cur.mins ?? 0) >= 3 * avg) lines.push({ icon: "↑", level: 60, text: `${cur.name} (${cur.dev}): ${dur(cur.mins!)} actief, ongeveer ${Math.round((cur.mins ?? 0) / Math.max(avg, 1))}× zoveel als normaal` });
      }
      const older = list.filter((g) => g.d !== today);
      if (older.length && !cur.isNew && (cur.mins ?? 0) >= 1) {
        const lastOld = Math.max(...older.map((g) => Date.parse(g.d)));
        const gap = Math.round((t0 - lastOld) / DAY);
        if (gap >= 7) lines.push({ icon: "↺", level: 55, text: `${cur.name} (${cur.dev}): weer gebruikt na ${gap} dagen` });
      }
    }
    for (const d of devs) {
      const runs = (d.away?.runs ?? []).filter((r) => r.e >= t0);
      if (runs.length) lines.push({ icon: "📍", level: 40, text: `${d.name}: onderweg ${runs.slice(0, 2).map((r) => `${timeFmt.format(r.s)}–${timeFmt.format(r.e)}`).join(", ")}` });
    }
    const fresh = groups.filter((g) => g.isNew && g.main && !g.bg && !g.susp && (g.bl ?? 0) < g.n && inScope(g.dev));
    const freshSites = [...new Set(fresh.map((g) => g.name))];
    if (freshSites.length) lines.push({ icon: "✨", level: 30, text: `${freshSites.length} nieuwe ${freshSites.length === 1 ? "site" : "sites"}: ${freshSites.slice(0, 4).join(", ")}${freshSites.length > 4 ? "…" : ""}` });
    return lines.sort((a, b) => b.level - a.level).slice(0, 8);
  }, [groups, devices, payments, device, today, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Dagbalk
  const dayStart = dayStartMs(now);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - dayStart) / DAY) * 100));

  // ---- Slaaptijd: dagen (nieuwste eerst) over alle apparaten
  const sleepDays = useMemo(() => {
    const set = new Set<string>();
    for (const d of devs) for (const s of d.sleep ?? []) set.add(s.d);
    return [...set].sort((a, b) => (a < b ? 1 : -1)).slice(0, 7);
  }, [devs]);

  // ---- Aankopen
  const checkouts = payments.filter((p) => p.level === "checkout" && inScope(p.dev));
  const store = payments.filter((p) => p.level === "store" && inScope(p.dev));

  // ---- Beveiliging
  const suspicious = groups
    .filter((g) => g.susp && g.main && !g.bg && inScope(g.dev))
    .sort((a, b) => b.last - a.last)
    .slice(0, 6);

  // ---- Echt bekeken (beeld/geluid-verkeer vandaag)
  const media = groups
    .filter((g) => g.d === today && (g.mm ?? 0) > 0 && g.main && !g.bg && inScope(g.dev))
    .sort((a, b) => (b.mm ?? 0) - (a.mm ?? 0))
    .slice(0, 6);

  const trackers = insights?.trackers ?? [];
  const maxTr = Math.max(1, ...trackers.map((t) => t.n));

  return (
    <div className="insights">
      <section className="card">
        <h3>Opvallend vandaag</h3>
        {notable.length === 0 ? <p className="muted ok">Niets bijzonders vandaag ✓</p> : notable.map((l, i) => (
          <div className="note" key={i}>
            <span className="ni">{l.icon}</span>
            <span>{l.text}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Vandaag per apparaat</h3>
        {devs.map((d) => {
          const runs = (d.away?.runs ?? []).filter((r) => r.e >= dayStart);
          return (
            <div className="dayrow" key={d.name}>
              <div className="dayhead">
                <span className="dev"><DevIcon name={d.name} />{d.name}</span>
                <span className="muted">{sumMin(d.ss ?? []) > 0 ? dur(sumMin(d.ss ?? [])) : "niets"}{d.away?.now ? " · nu onderweg" : ""}</span>
              </div>
              <div className="strip night">
                {(d.ss ?? []).map((x, i) => (
                  <span key={i} className="seg" style={{ left: `${pct(x.s)}%`, width: `${Math.max(0.7, pct(x.e) - pct(x.s))}%` }} />
                ))}
                <span className="nowline" style={{ left: `${pct(now)}%` }} />
              </div>
              {runs.length > 0 && (
                <div className="strip thin">
                  {runs.map((x, i) => (
                    <span key={i} className="seg away" style={{ left: `${pct(x.s)}%`, width: `${Math.max(0.7, pct(x.e) - pct(x.s))}%` }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="ticks"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
        <p className="muted tiny">Paars: actief · grijs: onderweg (buiten je wifi) · donkere rand: nacht</p>
      </section>

      <section className="card">
        <h3>Slaaptijd · eerste en laatste activiteit</h3>
        {sleepDays.length === 0 ? <p className="muted">Nog geen gegevens.</p> : (
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
                  const late = new Date(s.last).getTime() && (isNight(s.last) || isNight(s.first));
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
      </section>

      <section className="card">
        <h3>Aankopen</h3>
        {checkouts.length === 0 ? <p className="muted ok">Geen afrekenmomenten gezien ✓</p> : checkouts.slice(0, 8).map((p, i) => (
          <div className="note" key={i}>
            <span className="ni">💳</span>
            <span>{dayLabel(dayKeyFmt.format(p.t))} {timeFmt.format(p.t)} · {p.dev} · {p.kind}</span>
          </div>
        ))}
        {store.length > 0 && <p className="muted tiny">Daarnaast {store.length}× verkeer naar de App Store. Dat is meestal achtergrond (updates, controles) en geen aankoop, dus hier niet als melding.</p>}
      </section>

      <section className="card">
        <h3>Beveiliging</h3>
        {(() => {
          const withThreats = devs.filter((d) => (d.threats?.week ?? 0) > 0);
          const away = devs.filter((d) => d.away?.now);
          return (
            <>
              {withThreats.length === 0 ? (
                <div className="note"><span className="ni">🛡</span><span>Geen bekende kwaadaardige sites geblokkeerd ✓</span></div>
              ) : withThreats.map((d) => (
                <div className="note" key={d.name}>
                  <span className="ni">🛡</span>
                  <span>
                    <b>{d.name}</b>: {d.threats!.week}× een bekende kwaadaardige site geblokkeerd deze week ({d.threats!.today} vandaag)
                    {(d.threats?.top ?? []).length > 0 && <span className="muted"> · o.a. {d.threats!.top.slice(0, 3).map((x) => x.site).join(", ")}</span>}
                  </span>
                </div>
              ))}
              {suspicious.map((g) => (
                <div className="note" key={g.d + g.site + g.dev}>
                  <span className="ni">⚠</span>
                  <span><b>{g.site}</b> · {g.dev} · {g.susp}{g.cc ? ` · server in ${country(g.cc)}` : ""}</span>
                </div>
              ))}
              {suspicious.length === 0 && <div className="note"><span className="ni">🔍</span><span>Geen verdachte nieuwe adressen ✓</span></div>}
              <div className="note">
                <span className="ni">📍</span>
                <span>
                  {away.length === 0 ? "Alle apparaten zijn thuis" : away.map((d) => `${d.name} is onderweg sinds ${timeFmt.format(d.away!.since)}`).join(" · ")}
                  {devs.some((d) => d.away?.now === null) && <span className="muted"> · van {devs.filter((d) => d.away?.now === null).map((d) => d.name).join(", ")} is dit niet te bepalen</span>}
                </span>
              </div>
            </>
          );
        })()}
      </section>

      <section className="card">
        <h3>Echt bekeken of geluisterd vandaag</h3>
        {media.length === 0 ? <p className="muted">Geen video- of beeldverkeer gezien.</p> : media.map((g) => (
          <div className="note" key={g.site + g.dev}>
            <span className="ni">▶</span>
            <span><b>{g.name}</b> · {g.dev} · {dur(g.mm ?? 0)} beeld- of geluidsverkeer{(g.mins ?? 0) > (g.mm ?? 0) ? ` van ${dur(g.mins ?? 0)} actief` : ""}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Privacy · apps met de meeste trackers</h3>
        {trackers.length === 0 ? <p className="muted">Geen gegevens.</p> : trackers.slice(0, 6).map((t) => (
          <div className="bar-row" key={t.site}>
            <span className="bn">{t.name}</span>
            <span className="bt"><span className="bf" style={{ width: `${(t.n / maxTr) * 100}%` }} /></span>
            <span className="bv">{t.n.toLocaleString("nl-NL")}</span>
          </div>
        ))}
        <p className="muted tiny">Aantal verzoeken naar advertentie- en volgdiensten die NextDNS blokkeerde, gekoppeld aan de app die op dat moment actief was (schatting).</p>
      </section>
    </div>
  );
}
