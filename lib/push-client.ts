/**
 * Pushmeldingen op dit toestel (in de browser). Op een iPhone kan dat alleen als Klaro als app op het beginscherm staat
 * (Safari → Deel → Zet op beginscherm) en daarvandaan geopend is. De server (api/push.php) bewaart het abonnement; de
 * waarschuw-taak (scripts/waarschuw.ts) stuurt de meldingen.
 */
export type PushState = "geen" | "beginscherm" | "uit" | "aan" | "geweigerd";

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
/** iPhone/iPad in Safari (niet vanaf het beginscherm): meldingen kunnen pas na "Zet op beginscherm". */
const iosBrowser = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone && !matchMedia("(display-mode: standalone)").matches;

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return iosBrowser() ? "beginscherm" : "geen";
  if (Notification.permission === "denied") return "geweigerd";
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return "uit";
  const r = (await (await fetch(`/api/push.php?endpoint=${encodeURIComponent(sub.endpoint)}`, { credentials: "same-origin" })).json()) as { aan?: boolean };
  return r.aan ? "aan" : "uit";
}

const key = (b64u: string) => {
  const s = atob(b64u.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const post = (body: unknown) => fetch("/api/push.php", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Aanzetten (moet vanuit een tik gebeuren: dan vraagt de iPhone toestemming). */
export async function pushOn(): Promise<PushState> {
  if (!supported()) return iosBrowser() ? "beginscherm" : "geen";
  if ((await Notification.requestPermission()) !== "granted") return "geweigerd";
  const { publicKey } = (await (await fetch("/api/push.php", { credentials: "same-origin" })).json()) as { publicKey?: string };
  if (!publicKey) throw new Error("Meldingen zijn op de server nog niet klaar.");
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) }));
  const label = /iPad/.test(navigator.userAgent) ? "iPad" : /iPhone/.test(navigator.userAgent) ? "iPhone" : "Toestel";
  const res = await post({ subscription: sub.toJSON(), label });
  if (!res.ok) throw new Error("Aanzetten lukte niet.");
  return "aan";
}

export async function pushOff(): Promise<PushState> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) { await post({ uit: sub.endpoint }); await sub.unsubscribe(); }
  return "uit";
}

/** Nog een proefmelding (komt bij de volgende controle, binnen ongeveer 5 tot 15 minuten). */
export async function pushTest(): Promise<boolean> {
  const sub = await (await registration()).pushManager.getSubscription();
  return !!sub && (await post({ test: sub.endpoint })).ok;
}

/** Wanneer de waarschuw-taak laatst goed draaide (ms, of null) en op hoeveel toestellen meldingen aan staan. */
export async function pushHealth(): Promise<{ laatst: number | null; aantal: number | null }> {
  const r = (await (await fetch("/api/push.php", { credentials: "same-origin" })).json()) as { laatst?: number | null; aantal?: number };
  return { laatst: r.laatst ?? null, aantal: typeof r.aantal === "number" ? r.aantal : null };
}

export type SentAlert = { t: number; title: string; body: string };

/** De laatste meldingen met de echte tekst (op de iPhone zelf staat alleen "Er is iets om te bekijken"). */
export async function pushHistory(): Promise<SentAlert[]> {
  const r = (await (await fetch("/api/push.php", { credentials: "same-origin" })).json()) as { meldingen?: SentAlert[] };
  return r.meldingen ?? [];
}
