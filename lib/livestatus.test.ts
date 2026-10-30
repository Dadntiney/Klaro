import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceUse, isActiveNow, overtaken, superseded } from "./livestatus.ts";

const m = (x: number) => 1_800_000_000_000 + x * 60_000;
const g = (o: Record<string, unknown>) => ({ d: "2026-10-16", dev: "iPhone", n: 5, bg: false, main: true, ...o }) as never;

test("chip groen bij echt gebruik nu, en net zo lang als de rij 'nu' zegt", () => {
  const use = deviceUse([g({ site: "nu.nl", name: "nu.nl", ss: [{ s: m(0), e: m(1), n: 3 }], ts: [m(1)] })], new Set());
  assert.equal(isActiveNow(use, "iPhone", m(3.5)), true);
  assert.equal(isActiveNow(use, "iPhone", m(4.5)), false);
});

test("geen vals groen: Facebook en Instagram die samen op de achtergrond verversen", () => {
  const groups = [
    g({ site: "facebook.com", name: "Facebook", ss: [{ s: m(0), e: m(1), n: 3, f: 0 }], ts: [m(0), m(0.5), m(1)] }),
    g({ site: "instagram.com", name: "Instagram", ss: [{ s: m(0), e: m(1), n: 2, f: 0 }], ts: [m(0.2), m(1)] }),
  ];
  assert.equal(isActiveNow(deviceUse(groups, new Set()), "iPhone", m(1.5)), false);
});

test("geen vals groen: één los voorgeladen filmpje (Netflix op de iPad)", () => {
  const use = deviceUse([g({ dev: "iPad", site: "netflix.com", name: "Netflix", lm: m(0), ss: [{ s: m(0), e: m(0), n: 1, m: 1 }], ts: [m(0)] })], new Set());
  assert.equal(isActiveNow(use, "iPad", m(1)), false);
});

test("Google-zoekopdracht telt voor de chip (zoals in de lijst); een widget die zichzelf ververst niet", () => {
  const use = deviceUse([g({ site: "google.com", name: "Google", ss: [{ s: m(0), e: m(1), n: 3, f: 3 }], ts: [m(1)] })], new Set());
  assert.equal(isActiveNow(use, "iPhone", m(2)), true);
  const w = g({ site: "voetbal.nl", name: "voetbal.nl", ss: [{ s: m(0), e: m(0), n: 1, pv: 1 }], ts: [m(0), m(0.5), m(1.2)] });
  assert.equal(isActiveNow(deviceUse([w], new Set(["iPhone|voetbal.nl"])), "iPhone", m(1.5)), false);
});

test("groene chip noemt de app alleen als die zeker nu bezig is; anders geen naam (niet raden)", async () => {
  const { activeWhat } = await import("./livestatus.ts");
  const use = deviceUse([g({ dev: "Apple TV", site: "ziggogo.tv", name: "Ziggo GO", lm: m(40), ss: [{ s: m(0), e: m(40), n: 30, m: 30 }], ts: [m(40)] })], new Set());
  assert.equal(activeWhat(use, "Apple TV", m(42)), "Ziggo GO");
  assert.equal(activeWhat(use, "Apple TV", m(60)), undefined); // al lang niets meer
  assert.equal(activeWhat(use, "iPhone", m(42)), undefined);
});

test("niet meer 'nu' als er daarna een andere app begon die ook doorliep; wel nog 'nu' na even langs andere apps (tv-beginscherm)", () => {
  const disney = { s: m(0), e: m(130) };
  assert.equal(superseded(disney, [{ s: m(1), e: m(3) }, { s: m(2), e: m(3) }]), false); // Netflix/Max 1-2 min, Disney+ liep door
  assert.equal(superseded({ s: m(0), e: m(10) }, [{ s: m(9), e: m(25) }]), true); // gewoon overgestapt naar een andere app
  assert.equal(superseded({ s: m(5), e: m(10) }, [{ s: m(0), e: m(20) }]), false); // de andere begon eerder
  // klik vanuit Google naar een website: de website laadt 3 s later nog Google-advertentiecode; Google is niet meer "nu"
  assert.equal(superseded({ s: m(0), e: m(14) + 3_000 }, [{ s: m(14), e: m(14) }]), true);
  // maar wel nog "nu" als er daarna nog echt op Google gezocht werd
  assert.equal(superseded({ s: m(0), e: m(16) }, [{ s: m(14), e: m(14) }]), false);
});

test("app met een vaste melding (NPO op de iPad): de chip voegt de stukjes samen zoals de rij, anders zei hij te vroeg 'uit'", () => {
  // Echt voorbeeld 26 okt 16:12-16:37: NPO opent, daarna alleen de vaste melding via het doorverwijs-adres (stukjes zonder eigen gebruik).
  const npo = g({ dev: "iPad", site: "npo.nl", name: "NPO", ss: [{ s: m(14), e: m(14), n: 1 }, { s: m(6), e: m(6), n: 1 }, { s: m(0), e: m(0.3), n: 4 }], ts: [m(14)] });
  assert.equal(isActiveNow(deviceUse([npo], new Set(), { "iPad|npo-volger.nl": "npo.nl" }, ["iPad|npo.nl"]), "iPad", m(16)), true);
  // zonder vaste melding: alleen het eerste stukje telt, en dat is na 16 min voorbij
  assert.equal(isActiveNow(deviceUse([npo], new Set()), "iPad", m(16)), false);
});

test("volger zonder vaste melding (Hue op de telefoon): korte stukjes zonder beeld/geluid worden niet samengevoegd, net als in de rij", () => {
  // Echt voorbeeld 29 okt 17:35 en 17:44: twee losse Hue-tikjes; de rij zegt bij de tweede "geen gebruik", dus de chip mag niet groen worden.
  const hue = g({ site: "meethue.com", name: "Philips Hue", ss: [{ s: m(9.6), e: m(9.6), n: 1 }, { s: m(0), e: m(0.1), n: 3 }], ts: [m(9.6)] });
  assert.equal(isActiveNow(deviceUse([hue], new Set(), { "iPhone|hue-volger.com": "meethue.com" }), "iPhone", m(10.5)), false);
  // wel samengevoegd als dit apparaat voor deze app bewezen een vaste melding heeft
  assert.equal(isActiveNow(deviceUse([hue], new Set(), { "iPhone|hue-volger.com": "meethue.com" }, ["iPhone|meethue.com"]), "iPhone", m(10.5)), true);
});

test("losse opvragingen uit nieuwsbrieven maken de chip niet groen; echte losse opvragingen van meerdere sites wel", () => {
  // Echt voorbeeld 29 okt 16:25: plaatjes van twee nieuwsbrieven binnen een minuut; de rij toont niets, dus de chip ook niet.
  const mail = (site: string, t: number) => g({ site, name: site, ss: [{ s: m(t), e: m(t), n: 1, ml: 1, mh: 0, res: 1 }], ts: [m(t), m(t), m(t)] });
  assert.equal(isActiveNow(deviceUse([mail("nieuwsbrief-a.nl", 0), mail("nieuwsbrief-b.nl", 1)], new Set()), "iPhone", m(1.5)), false);
  // zelfde tijdstippen, maar gewoon losse opvragingen van twee sites (geen nieuwsbrief): wel groen
  const los = (site: string, t: number) => g({ site, name: site, ss: [{ s: m(t), e: m(t), n: 1 }], ts: [m(t), m(t), m(t)] });
  assert.equal(isActiveNow(deviceUse([los("site-a.nl", 0), los("site-b.nl", 1)], new Set()), "iPhone", m(1.5)), true);
});

test("telefoon: na een site weer verder op Google (17 s later) is de site niet meer 'nu'", () => {
  const site = { s: m(10), e: m(10) };
  assert.equal(overtaken(site, [{ e: m(10) + 17_000 }]), true);
  assert.equal(overtaken(site, [{ e: m(10) + 5_000 }]), false); // code die de pagina zelf meelaadt telt niet
  assert.equal(overtaken(site, [{ e: m(9) }]), false);
});
