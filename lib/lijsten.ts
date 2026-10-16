/**
 * Bijwerken van de 18+- en datinglijsten (data/*.txt.gz) uit openbare bronlijsten. Gebruikt door scripts/update-lists.ts,
 * dat dagelijks draait (.github/workflows/update-lists.yml). Alleen toevoegen, nooit weghalen: een domein dat ooit op een
 * lijst stond, blijft herkend. Grote platforms staan nooit op de lijst (NEVER), ook als een bron ze ten onrechte bevat.
 */
export const NEVER = new Set([
  "google.com", "youtube.com", "facebook.com", "instagram.com", "apple.com", "icloud.com", "amazon.com", "microsoft.com", "twitter.com", "x.com",
  "reddit.com", "tiktok.com", "snapchat.com", "whatsapp.com", "whatsapp.net", "cloudfront.net", "akamaized.net", "amazonaws.com", "googleapis.com",
  "fastly.net", "cloudflare.com", "imgur.com", "tumblr.com", "discord.com", "telegram.org", "t.me", "pinterest.com", "wikipedia.org", "vercel.app",
  "github.io", "blogspot.com", "wordpress.com", "itch.io", "netflix.com", "spotify.com", "bol.com", "nu.nl", "nos.nl",
]);

/** Domeinen uit een bronlijst (hosts-bestand, adblock-regels of kale lijst). */
export function parseList(text: string): Set<string> {
  const out = new Set<string>();
  for (let l of text.split("\n")) {
    l = l.trim().toLowerCase();
    if (!l || l[0] === "#" || l[0] === "!") continue;
    const p = l.split(/\s+/);
    let h = (p[0] === "0.0.0.0" || p[0] === "127.0.0.1") && p[1] ? p[1] : p[0];
    h = h.replace(/^\|\|/, "").replace(/\^.*$/, "").replace(/^\*\./, "").replace(/^\./, "");
    if (h.includes(".") && /^[a-z0-9.-]+$/.test(h) && h !== "localhost" && !h.endsWith(".")) out.add(h);
  }
  return out;
}

/** Kortste vorm: een subdomein weg als het ouderdomein er al op staat. */
export function minimal(set: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const h of [...set].sort((a, b) => a.split(".").length - b.split(".").length)) {
    const parts = h.split(".");
    let covered = false;
    for (let i = 1; i < parts.length - 1; i++) if (out.has(parts.slice(i).join("."))) { covered = true; break; }
    if (!covered) out.add(h);
  }
  return out;
}

/** Oude lijst + nieuwe bronnen → nieuwe lijst (nooit kleiner, nooit een groot platform) en wat erbij kwam. */
export function mergeLists(old: Set<string>, sources: Set<string>[]): { next: Set<string>; added: string[] } {
  const all = new Set(old);
  for (const s of sources) for (const h of s) all.add(h);
  // Alleen het platform zelf (en www.): subdomeinen zoals een 18+-blog op tumblr.com of blogspot.com horen wél op de lijst.
  const never = (h: string) => NEVER.has(h.replace(/^www\./, ""));
  for (const h of [...all]) if (never(h)) all.delete(h);
  const next = minimal(all);
  for (const h of old) if (!never(h) && ![...h.split(".").keys()].some((i) => next.has(h.split(".").slice(i).join(".")))) next.add(h); // nooit iets kwijt
  return { next, added: [...next].filter((h) => !old.has(h)).sort() };
}
