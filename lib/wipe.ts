/**
 * Bij uitloggen (zelf, of automatisch na 60 minuten zonder gebruik) alles van het logboek van dit toestel weghalen: de bewaarde
 * kopie van de NextDNS-gegevens (IndexedDB, lib/rawsource.ts) en wat de pagina onthoudt over sites (klaro-auto, klaro-gezien).
 * Zo blijft er na uitloggen niets van het gebruik op een (geleend) toestel achter. Weergave-instellingen blijven.
 */
export const PRIVATE_KEYS = ["klaro-auto", "klaro-gezien"];

export function wipeLocal(): Promise<void> {
  for (const k of PRIVATE_KEYS) try { localStorage.removeItem(k); } catch {}
  return new Promise((res) => {
    try {
      const r = indexedDB.deleteDatabase("klaro");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    } catch { res(); }
  });
}
