/**
 * Apparaatnamen bevatten vaak namen van personen. We tonen daarom alleen het soort apparaat
 * ("iPhone", "iPad", "MacBook"), afgeleid van de naam en het model. De echte naam verlaat de server nooit.
 */
const RULES: [RegExp, string][] = [
  [/iphone/, "iPhone"],
  [/ipad/, "iPad"],
  [/macbook/, "MacBook"],
  [/imac/, "iMac"],
  [/mac\s*mini|macmini/, "Mac mini"],
  [/apple\s*tv|appletv/, "Apple TV"],
  [/homepod/, "HomePod"],
  [/\bmac\b|macos|mac-?pro|mac-?studio/, "Mac"],
  [/playstation|\bps[345]\b/, "PlayStation"],
  [/xbox/, "Xbox"],
  [/nintendo|\bswitch\b/, "Nintendo Switch"],
  [/chromebook/, "Chromebook"],
  [/\btv\b|roku|firestick|fire\s*tv|chromecast|smart-?tv|bravia/, "TV"],
  [/echo|alexa|google\s*home|nest\s*(hub|mini|audio)|sonos/, "Slimme speaker"],
  [/galaxy\s*tab|\btab\b|tablet/, "Tablet"],
  [/pixel|galaxy|android|samsung|oneplus|xiaomi|huawei|oppo|motorola|redmi|poco/, "Android-telefoon"],
  [/laptop|notebook/, "Laptop"],
  [/windows|win-?1[01]|desktop|\bpc\b|thinkpad|surface|dell|lenovo|asus|acer|\bhp\b/, "Windows-pc"],
  [/linux|ubuntu|raspberry/, "Linux-apparaat"],
];

export function deviceType(name: string, model = ""): string {
  const text = `${name} ${model}`.toLowerCase();
  for (const [re, label] of RULES) if (re.test(text)) return label;
  return text.trim() ? "Apparaat" : "Onbekend";
}

/** Geef elk apparaat (id) een label; bij meerdere van hetzelfde soort worden ze genummerd ("iPhone 1", "iPhone 2"). */
export function labelDevices(devices: { id: string; type: string }[]): Record<string, string> {
  const byType = new Map<string, string[]>();
  for (const d of devices) byType.set(d.type, [...new Set([...(byType.get(d.type) ?? []), d.id])]);
  const out: Record<string, string> = {};
  for (const [type, ids] of byType) {
    ids.sort();
    ids.forEach((id, i) => (out[id] = ids.length > 1 ? `${type} ${i + 1}` : type));
  }
  return out;
}
