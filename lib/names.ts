/** Haal verborgen namen (komma-gescheiden, bijv. uit HIDDEN_NAMES) uit een apparaatnaam: "iPhone van Anna" -> "iPhone". */
export function cleanDevice(raw: string, hidden: string): string {
  let name = raw.trim();
  for (const word of hidden.split(",").map((w) => w.trim()).filter(Boolean)) {
    const w = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    name = name.replace(new RegExp(`(\\s+van)?\\s*\\b${w}\\b(['’]?s)?`, "gi"), " ");
  }
  name = name.replace(/\s+/g, " ").replace(/^(van|de|het)\s+/i, "").trim();
  return name || "Apparaat";
}
