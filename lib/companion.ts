/**
 * Apps die tijdens gebruik vooral algemene adressen opvragen (geen eigen naam): bij Minecraft op een iPad/iPhone stuurt het spel
 * elke ~20 seconden meetgegevens naar Microsoft (onedscolprd*.cloudapp.azure.com, self.events.data.microsoft.com), en verder
 * bijna niets. Die adressen gebruiken ook andere Microsoft-apps (Edge, Office), dus ze tellen alleen als het spel als ze
 * aansluiten op echt spelverkeer (`anchor`) op hetzelfde apparaat: elke opvraging hooguit `keep` na de vorige.
 * iOS legt een spel stil zodra het niet meer in beeld is; dan stoppen de meetgegevens en eindigt de keten vanzelf.
 * De Xbox-aanmelding vlak vóór het spel (tot `lead` ervoor) hoort ook bij het opstarten van het spel.
 */
export interface Companion {
  app: string; // site van de app in lib/sites.ts
  anchor: RegExp; // adressen die alleen het spel zelf gebruikt (niet de website)
  hosts: RegExp; // algemene adressen die alleen in de keten bij het spel horen
  keep: number;
  lead: number;
}

export const COMPANIONS: Companion[] = [
  {
    app: "minecraft.net",
    anchor: /(^|\.)minecraft-services\.net$|(^|\.)minecraftservices\.com$|(^|\.)(hivebedrock\.(eu|network)|lbsg\.net|lifeboat\.games|cubecraft\.net|galaxite\.net|enchanted\.gg|megasmp\.gg|inpvp\.net|donutsmp\.org|mineville\.org)$/,
    hosts: /^onedscolprd[a-z0-9]+\.[a-z0-9]+\.cloudapp\.azure\.com$|^(self|mobile)\.events\.data\.microsoft\.com$|^self-events-data\.trafficmanager\.net$|(^|\.)xboxlive\.com$/,
    keep: 300_000,
    lead: 60_000,
  },
];

export function companionFor(host: string): Companion | undefined {
  return COMPANIONS.find((c) => c.hosts.test(host));
}

export function anchorOf(host: string): Companion | undefined {
  return COMPANIONS.find((c) => c.anchor.test(host));
}

/** Welke tijdstippen van algemene adressen bij het spel horen (aaneengesloten keten vanaf echt spelverkeer). */
export function chainTimes(anchors: number[], hosts: number[], keep: number, lead: number): Set<number> {
  const ev = [...anchors.map((t) => ({ t, a: true })), ...hosts.map((t) => ({ t, a: false }))].sort((x, y) => x.t - y.t || (x.a ? -1 : 1));
  const out = new Set<number>();
  let last = -Infinity;
  for (const e of ev) {
    if (e.a) last = e.t;
    else if (e.t - last <= keep) { out.add(e.t); last = e.t; }
  }
  // Aanmelden vlak vóór het spel (Xbox): hoort bij het opstarten.
  for (const t of hosts) if (!out.has(t) && anchors.some((a) => a >= t && a - t <= lead)) out.add(t);
  return out;
}

/**
 * Sites die altijd met een hulpadres van een andere site meekomen: een script op github.io dat een websitebouwer
 * (publish.yoursite.io) bij elke pagina laadt. Komt een site elke keer (minstens 3 momenten, op minstens 2 dagen) hooguit
 * 10 seconden na hetzelfde hulpadres (geen pagina, geen achtergrond) van een andere site, dan is het een onderdeel daarvan.
 * Eén keer zonder dat hulpadres en de site telt gewoon. Zo vaak precies in die volgorde opent een mens nooit zelf een site.
 * `ev`: per apparaat alles, gesorteerd of niet: `page` = adres van de site zelf, `helper` = hulpadres van een site.
 */
export function loadedWith(ev: { t: number; dev: string; host: string; site: string; page?: boolean; helper?: boolean }[]): Set<string> {
  const byDev = new Map<string, typeof ev>();
  for (const e of ev) (byDev.get(e.dev) ?? byDev.set(e.dev, []).get(e.dev)!).push(e);
  const st = new Map<string, { m: number; days: Set<string>; with: Set<string> | null }>();
  for (const [, list] of byDev) {
    list.sort((a, b) => a.t - b.t);
    const last = new Map<string, number>();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.page) continue;
      const prevT = last.get(e.site);
      last.set(e.site, e.t);
      if (prevT !== undefined && e.t - prevT <= 1_500) continue; // zelfde moment
      const before = new Set<string>();
      for (let j = i - 1; j >= 0 && list[j].t >= e.t - 10_000; j--) if (list[j].helper && list[j].site !== e.site) before.add(list[j].host);
      const s = st.get(e.site) ?? st.set(e.site, { m: 0, days: new Set(), with: null }).get(e.site)!;
      s.m++;
      s.days.add(new Date(e.t).toISOString().slice(0, 10));
      s.with = s.with === null ? before : new Set([...s.with].filter((h) => before.has(h)));
    }
  }
  return new Set([...st].filter(([, s]) => s.m >= 3 && s.days.size >= 2 && s.with!.size > 0).map(([site]) => site));
}
