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
