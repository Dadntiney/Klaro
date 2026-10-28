// Korte tik (haptische feedback) bij knoppen en menu's (wens eigenaar 28 okt). Een website mag de iPhone niet zelf laten trillen
// (geen navigator.vibrate in Safari), maar Safari geeft vanaf iOS 18 zelf een tikje bij een aan/uit-schakelaar: die zetten we
// onzichtbaar om, binnen dezelfde tik van de gebruiker. Android: gewoon vibrate. Lukt het niet, dan gebeurt er niets.

/** Elementen die een tikje geven: knoppen, links, apparaatknoppen, een regel aantikken, uitklappen. */
export const HAPTIC_TARGETS = "button, a[href], summary, [role=button], .chip, .item.clickable, select, label";

let sw: HTMLLabelElement | null = null;

export function haptic(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && navigator.vibrate(8)) return;
    if (typeof document === "undefined") return;
    if (!sw) {
      sw = document.createElement("label");
      sw.setAttribute("aria-hidden", "true");
      sw.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      sw.appendChild(input);
      document.body.appendChild(sw);
    }
    sw.click();
  } catch {}
}

/** Eén luisteraar voor de hele pagina: elk tikje op een knop of menu geeft een korte tik. */
export function startHaptics(): () => void {
  if (typeof document === "undefined") return () => {};
  const on = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (!t || !t.closest || (sw && sw.contains(t))) return; // het onzichtbare schakelaartje zelf niet
    if (t.closest(HAPTIC_TARGETS)) haptic();
  };
  document.addEventListener("click", on, true);
  return () => document.removeEventListener("click", on, true);
}
