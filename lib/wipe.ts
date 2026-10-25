/**
 * Bij uitloggen (zelf, of automatisch na 30 dagen zonder gebruik) alles van het logboek van dit toestel weghalen: de bewaarde
 * kopie van de NextDNS-gegevens (IndexedDB, lib/rawsource.ts) en wat de pagina onthoudt over sites (klaro-auto, klaro-gezien).
 * Zo blijft er na uitloggen niets van het gebruik op een (geleend) toestel achter. Ook de gekozen weergave (klaro-view): na het
 * inloggen begint Klaro altijd in het gewone overzicht, niet in de NextDNS-lijst.
 */
export const PRIVATE_KEYS = ["klaro-auto", "klaro-gezien", "klaro-view"];

export function wipeLocal(): Promise<void> {
  for (const k of PRIVATE_KEYS) try { localStorage.removeItem(k); } catch {}
  return new Promise((res) => {
    try {
      const r = indexedDB.deleteDatabase("klaro");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    } catch { res(); }
  });
}
