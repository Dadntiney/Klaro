// Korte tik (haptische feedback) bij knoppen en menu's (wens eigenaar 28 okt). Een website mag de iPhone niet zelf laten trillen
// (geen navigator.vibrate in Safari), maar Safari geeft vanaf iOS 18 zelf een tikje bij een aan/uit-schakelaar: die zetten we
// onzichtbaar om, binnen dezelfde tik van de gebruiker. Android: gewoon vibrate. Lukt het niet, dan gebeurt er niets.

/** Elementen die een tikje geven: knoppen, links, apparaatknoppen, een regel aantikken, uitklappen. */
export const HAPTIC_TARGETS = "button, a[href], summary, [role=button], .chip, .item.clickable, select, label";

let busy = false; // het eigen schakelaartje geeft zelf ook een klik: die niet nog eens afhandelen

export function haptic(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && navigator.vibrate(8)) return;
    if (typeof document === "undefined") return;
    // Zoals de bekende werkende aanpak (iOS 18+): elke keer een nieuw, onzichtbaar schakelaartje in <head>, aanklikken, weghalen.
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    busy = true;
    label.click();
    busy = false;
    label.remove();
  } catch { busy = false; }
}

/** Eén luisteraar voor de hele pagina: elk tikje op een knop of menu geeft een korte tik. */
export function startHaptics(): () => void {
  if (typeof document === "undefined") return () => {};
  const on = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (busy || !t || !t.closest) return; // het onzichtbare schakelaartje zelf niet
    if (t.closest(HAPTIC_TARGETS)) haptic();
  };
  document.addEventListener("click", on, true);
  return () => document.removeEventListener("click", on, true);
}
