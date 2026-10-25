/**
 * Meldt echt gebruik aan de server (api/activity.php): tikken, klikken, scrollen of typen, alleen in een tabblad dat in beeld is
 * en focus heeft. Hooguit eens per minuut; gebruik binnen die minuut wordt achteraf gemeld met hoe lang geleden het was, zodat
 * de server precies weet wanneer de app voor het laatst gebruikt is. Live bijwerken meldt nooit iets: na 30 dagen zonder echt
 * gebruik (op geen enkel apparaat) logt de server iedereen uit. Zie php/api/common.php.
 */
export const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
const EVERY = 60_000;

export interface ActivityDeps {
  now: () => number;
  visible: () => boolean; // tabblad in beeld en met focus
  send: (agoSeconds: number) => void;
  later: (fn: () => void, ms: number) => void;
}

/** Bepaalt wanneer er gemeld wordt (los van de browser, zodat het te testen is). */
export function activityReporter(d: ActivityDeps) {
  let lastSent = -Infinity;
  let pending: number | null = null; // tijdstip van gebruik dat nog gemeld moet worden
  const flush = () => {
    if (pending === null) return;
    const t = pending;
    pending = null;
    lastSent = d.now();
    d.send(Math.max(0, Math.round((d.now() - t) / 1000)));
  };
  return (trusted: boolean) => {
    if (!trusted || !d.visible()) return; // geen nagemaakte of achtergrond-gebeurtenissen
    const t = d.now();
    if (t - lastSent >= EVERY) { pending = t; flush(); return; }
    if (pending === null) d.later(flush, lastSent + EVERY - t);
    pending = t;
  };
}

/** Op de pagina starten; geeft een functie terug om te stoppen. */
export function startActivityReporting(onLoggedOut: (res: Response) => void): () => void {
  const report = activityReporter({
    now: () => Date.now(),
    visible: () => document.visibilityState === "visible" && document.hasFocus(),
    send: (ago) => {
      fetch(`/api/activity.php?ago=${ago}`, { method: "POST", headers: { "X-Klaro": "1" }, credentials: "same-origin", cache: "no-store", keepalive: true })
        .then((res) => { if (res.status === 401) onLoggedOut(res); })
        .catch(() => {});
    },
    later: (fn, ms) => { setTimeout(fn, ms); },
  });
  const on = (e: Event) => report(e.isTrusted);
  for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, on, { passive: true, capture: true });
  return () => { for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, on, { capture: true }); };
}
