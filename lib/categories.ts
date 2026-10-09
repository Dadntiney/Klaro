export interface Category {
  name: string;
  keywords: string[];
}

export const DEFAULT_CATEGORIES: Category[] = [
  { name: "Speelgoed", keywords: ["lego", "toy", "speelgoed", "playmobil", "mattel", "hasbro", "bol.com/speelgoed", "intertoys", "bricks", "barbie", "fisher-price", "smyths"] },
  { name: "Games", keywords: ["game", "steam", "roblox", "minecraft", "fortnite", "epicgames", "xbox", "playstation", "nintendo", "twitch", "riotgames", "blizzard", "ea.com", "supercell", "king.com", "miniclip", "poki"] },
  { name: "Sociale media", keywords: ["facebook", "instagram", "tiktok", "snapchat", "whatsapp", "discord", "twitter", "x.com", "pinterest", "reddit", "fbcdn"] },
  { name: "Video & streaming", keywords: ["youtube", "ytimg", "googlevideo", "netflix", "disneyplus", "videoland", "npostart", "spotify", "twitch", "primevideo"] },
  { name: "Educatie", keywords: ["school", "wikipedia", "khanacademy", "duolingo", "somtoday", "magister", "kennisnet", "edu"] },
];

export function categorize(domain: string, cats: Category[]): string | null {
  for (const c of cats) {
    if (c.keywords.some((k) => k && domain.includes(k.toLowerCase()))) return c.name;
  }
  return null;
}
