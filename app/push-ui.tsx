"use client";

import { pushDismiss, pushHealth, pushHistory, pushOff, pushOn, pushState, pushTest, type PushState, type SentAlert } from "@/lib/push-client";
import { useEffect, useRef, useState } from "react";
import { dayKeyFmt, dayLabel, timeFmt } from "./ui";

/**
 * Zelfbewaking bovenaan: draaide de waarschuw-taak (elke 5 min, tussen twee runs hooguit ~7 min) al 20 minuten niet goed, dan
 * meteen zichtbaar zeggen; anders lijkt "geen melding" op "niets aan de hand". Stond eerst onderaan en pas na een uur (30 okt).
 */
export function WatchStuck() {
  const [laatst, setLaatst] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Steeds opnieuw vragen: één keer bij het openen gaf een vals "niet gedraaid" als de app lang open bleef (20 okt).
    const health = () => { if (document.visibilityState === "visible") pushHealth().then((h) => { setLaatst(h.laatst); setNow(Date.now()); }, () => {}); };
    health();
    const t = setInterval(health, 60_000);
    document.addEventListener("visibilitychange", health);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", health); };
  }, []);
  if (laatst === null || now - laatst <= 20 * 60_000) return null;
  return <p className="pushwarn top" role="alert">Let op: waarschuwen heeft sinds {dayLabel(dayKeyFmt.format(laatst)).toLowerCase()} {timeFmt.format(laatst)} niet gedraaid. Meldingen bij 18+, dating of VPN komen nu niet.</p>;
}

/**
 * Meldingen bij 18+, dating en VPN op dit toestel, ook als Klaro dicht is (onderaan, naast Uitloggen). Op de iPhone kan dat
 * alleen vanaf het beginscherm; in Safari staat er dan hoe.
 */
export function PushToggle() {
  const [st, setSt] = useState<PushState | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<SentAlert[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [aantal, setAantal] = useState<number | null>(null); // op hoeveel toestellen meldingen aan staan
  const [offAsk, setOffAsk] = useState(false);
  const [offWord, setOffWord] = useState("");
  const histRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pushState().then(setSt, () => setSt("geen"));
    // Steeds opnieuw vragen: één keer bij het openen gaf een vals "niet gedraaid" als de app lang open bleef (20 okt).
    const health = () => { if (document.visibilityState === "visible") pushHealth().then((h) => setAantal(h.aantal), () => {}); };
    health();
    document.addEventListener("visibilitychange", health);
    // Getikt op een melding (die bewust niets zegt): meteen de echte tekst laten zien.
    const open = () => { pushHistory().then(setHist, () => {}); setShowHist(true); setTimeout(() => histRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300); };
    if (new URLSearchParams(location.search).has("meldingen")) { open(); history.replaceState(null, "", "/"); }
    else pushHistory().then(setHist, () => {});
    const onMsg = (e: MessageEvent) => { if ((e.data as { meldingen?: number })?.meldingen) open(); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => { navigator.serviceWorker?.removeEventListener("message", onMsg); document.removeEventListener("visibilitychange", health); };
  }, []);
  const run = (fn: () => Promise<PushState | boolean>, done: string) => {
    setBusy(true);
    setNote("");
    fn().then((r) => { if (typeof r === "string") setSt(r); setNote(r === "geweigerd" ? "Meldingen zijn geweigerd: zet ze aan bij Instellingen → Meldingen → Dobber." : done); }, (e) => setNote(e instanceof Error ? e.message : "Dat lukte niet.")).finally(() => setBusy(false));
  };
  if (st === null || st === "geen") return null;
  const on = st === "aan";
  return (
    <>
      {aantal === 0 && <p className="pushwarn">Let op: meldingen staan op geen enkel toestel aan. Open Dobber vanaf je beginscherm en zet ze aan.</p>}
      <FoldRow label="Meldingen" value={<><span className={"dot" + (on ? " on" : "")} aria-hidden />{on ? "aan" : st === "beginscherm" ? "alleen in de app" : "uit"}</>}>
        {st === "beginscherm" && <p>Je kijkt nu in Safari. Meldingen werken alleen in de Dobber-app op je beginscherm; daar staan ze apart aan of uit. Nog geen Dobber op je beginscherm? Deel → Zet op beginscherm, en open hem daar.</p>}
        {(st === "uit" || st === "geweigerd") && <button type="button" className="setbtn" disabled={busy} onClick={() => run(pushOn, "Meldingen staan aan. Binnen een kwartier komt een proefmelding.")}>Meldingen aanzetten</button>}
        {on && (
          <>
            <p className="muted">Op het scherm staat alleen ‘Er is iets om te bekijken’; wat er gebeurde zie je hier onder Laatste meldingen.</p>
            <div className="setbtns">
              <button type="button" className="setbtn" disabled={busy} onClick={() => run(pushTest, "Proefmelding komt binnen een kwartier.")}>Proefmelding sturen</button>
              {!offAsk && <button type="button" className="setbtn quiet" disabled={busy} onClick={() => { setOffAsk(true); setOffWord(""); }}>Uitzetten…</button>}
            </div>
            {/* Niet per ongeluk uitzetten (wens eigenaar): eerst het woord UITZETTEN overtypen. */}
            {offAsk && (
              <form className="offask" onSubmit={(e) => { e.preventDefault(); if (offWord.trim().toUpperCase() !== "UITZETTEN") return; setOffAsk(false); run(pushOff, "Meldingen staan uit."); }}>
                <label>Weet je het zeker? Typ <b>UITZETTEN</b> om de meldingen op dit toestel uit te zetten.
                  <input value={offWord} onChange={(e) => setOffWord(e.target.value)} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} />
                </label>
                <div className="setbtns">
                  <button type="submit" className="setbtn danger" disabled={busy || offWord.trim().toUpperCase() !== "UITZETTEN"}>Definitief uitzetten</button>
                  <button type="button" className="setbtn quiet" onClick={() => setOffAsk(false)}>Toch aan laten</button>
                </div>
              </form>
            )}
          </>
        )}
        {note && <p className="pushnote">{note}</p>}
      </FoldRow>
      {on && (
        <div ref={histRef}>
          <FoldRow label="Laatste meldingen" value={String(hist.length)} open={showHist} onToggle={setShowHist}>
            {hist.length === 0 ? <p className="muted">Nog geen meldingen in de laatste 30 dagen.</p> : (
              <ul className="setlist">
                {hist.slice(0, 20).map((m, i) => (
                  <li key={m.t + ":" + i} className="histitem">
                    <span className="muted">{dayLabel(dayKeyFmt.format(m.t))} {timeFmt.format(m.t)}</span>
                    <span>{m.title.replace(/^(Klaro|Dobber): /, "")}: {m.body}</span>
                    {/* Wegtikken: weg op alle toestellen. Anders verdwijnt een melding na 30 dagen vanzelf. */}
                    <button type="button" className="hist-x" aria-label="Melding weghalen" onClick={() => { setHist((h) => h.filter((x) => x !== m)); pushDismiss(m).catch(() => pushHistory().then(setHist, () => {})); }}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </FoldRow>
        </div>
      )}
    </>
  );
}

/** Een rij onderaan in dezelfde stijl als de dagkoppen: hoofdletters, waarde in grijs, pijltje dat openklapt. */
export function FoldRow({ label, value, open, onToggle, children }: { label: string; value?: React.ReactNode; open?: boolean; onToggle?: (v: boolean) => void; children: React.ReactNode }) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const toggle = () => (onToggle ? onToggle(!isOpen) : setOwn(!isOpen));
  return (
    <div className="setrow">
      <h2 className="fold" role="button" tabIndex={0} aria-expanded={isOpen} onClick={toggle} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}>
        {label}
        {value !== undefined && <span className="muted">· {value}</span>}
        <span className={"fold-chev" + (isOpen ? " up" : "")} aria-hidden>›</span>
      </h2>
      {isOpen && <div className="setbody">{children}</div>}
    </div>
  );
}
