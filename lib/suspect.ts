/** Herkenning van nepsites en verdachte adressen op het basisdomein; geeft een korte reden of null. */

const BRANDS: Record<string, string[]> = {
  paypal: ["paypal.com"], rabobank: ["rabobank.nl"], abnamro: ["abnamro.nl", "abnamro.com"], belastingdienst: ["belastingdienst.nl"],
  microsoft: ["microsoft.com"], facebook: ["facebook.com"], instagram: ["instagram.com"], whatsapp: ["whatsapp.com"], snapchat: ["snapchat.com"],
  netflix: ["netflix.com"], spotify: ["spotify.com"], amazon: ["amazon.com", "amazon.nl", "amazon.de", "amazon.co.uk"], marktplaats: ["marktplaats.nl"],
  postnl: ["postnl.nl"], icloud: ["icloud.com"], digid: ["digid.nl"], tikkie: ["tikkie.me"], binance: ["binance.com"], coinbase: ["coinbase.com"],
  roblox: ["roblox.com"], minecraft: ["minecraft.net"], fortnite: ["fortnite.com", "epicgames.com"], discord: ["discord.com"], tiktok: ["tiktok.com"],
  youtube: ["youtube.com"], google: ["google.com"], apple: ["apple.com"], disneyplus: ["disneyplus.com"], vinted: ["vinted.com", "vinted.nl"],
};
const RISKY_TLD = new Set(["xyz", "top", "click", "zip", "mov", "icu", "buzz", "gq", "tk", "ml", "cf", "ga", "work", "loan", "rest", "monster", "cyou", "sbs", "cfd", "shop", "live", "site", "online", "support", "link", "life", "vip"]);
const BAIT = /(login|inlog|inloggen|secure|veilig|verify|verif|account|update|support|helpdesk|gratis|free|prize|winn|claim|bonus|robux|vbucks|giveaway|cadeau)/;

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function suspicion(site: string): string | null {
  const parts = site.split(".");
  const tld = parts[parts.length - 1];
  const label = parts.length >= 3 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2] ?? "";
  if (!label) return null;
  if (label.startsWith("xn--") || /[^\x00-\x7f]/.test(site)) return "vreemde tekens in het adres";

  // lijkt op een bekend merk, maar is het niet. Eigen hulpadressen van grote merken (googleapis, apple-dns) laten we met rust:
  // een merknaam in het adres telt alleen mee met een lokwoord of een risicovolle eindiging.
  for (const [brand, official] of Object.entries(BRANDS)) {
    if (official.includes(site) || official.some((o) => site.endsWith("." + o))) continue;
    if (label !== brand && label.includes(brand) && (BAIT.test(label) || RISKY_TLD.has(tld))) return `lijkt op ${brand}`;
    if (/^\d/.test(label)) continue; // typefout-regels niet voor namen die met een cijfer beginnen (6cloud.fr)
    if (label.length >= 6 && brand.length >= 6 && label.length >= brand.length - 1 && label.length <= brand.length + 1 && lev(label, brand) === 1) return `lijkt op ${brand} (typefout)`;
    if (brand.length >= 8 && label.length >= 8 && lev(label, brand) === 2 && Math.abs(label.length - brand.length) <= 1) return `lijkt op ${brand} (typefout)`;
  }
  if (RISKY_TLD.has(tld) && BAIT.test(label)) return "lokwoorden bij een risicovolle eindiging";
  // willekeurige naam (zoals bij kwaadaardige software of wegwerpadressen)
  const digits = (label.match(/\d/g) ?? []).length;
  const vowels = (label.match(/[aeiou]/g) ?? []).length;
  if (!label.includes("-") && ((label.length >= 14 && vowels / label.length < 0.16) || (label.length >= 10 && vowels / label.length < 0.1))) return "willekeurige naam";
  if (label.length >= 8 && digits / label.length >= 0.5) return "willekeurige naam";
  return null;
}
