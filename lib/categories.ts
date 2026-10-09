/** Categorie van een site/app, op basisdomein. Alles wat hier niet in staat valt onder "Overig". */
const CATS: Record<string, string[]> = {
  Games: [
    "roblox.com", "steampowered.com", "epicgames.com", "minecraft.net", "nintendo.com", "playstation.com", "xbox.com", "supercell.com", "king.com",
    "miniclip.com", "poki.com", "crazygames.com", "y8.com", "friv.com", "ea.com", "riotgames.com", "blizzard.com", "battle.net", "ubisoft.com",
    "rockstargames.com", "mojang.com", "garena.com", "itch.io", "gamejolt.com", "kongregate.com", "armorgames.com", "coolmathgames.com",
    "brawlstars.com", "clashofclans.com", "pokemon.com", "pokemongo.com", "fortnite.com", "unity3d.com", "applovin.com", "gamesgames.com", "spele.nl", "spelletjes.nl",
  ],
  "Sociale media": [
    "facebook.com", "instagram.com", "tiktok.com", "snapchat.com", "whatsapp.com", "discord.com", "twitter.com", "x.com", "pinterest.com", "pinterest.nl",
    "reddit.com", "telegram.org", "t.me", "signal.org", "bereal.com", "tumblr.com", "linkedin.com", "threads.net", "yubo.live", "kik.com", "wechat.com", "messenger.com", "vk.com",
  ],
  Video: [
    "youtube.com", "netflix.com", "disneyplus.com", "videoland.com", "npo.nl", "npostart.nl", "primevideo.com", "twitch.tv", "vimeo.com", "hbomax.com", "max.com",
    "viki.com", "kijk.nl", "rtl.nl", "dailymotion.com", "ziggogo.tv", "canalplus.com", "appletv.com", "pathe.nl", "nickelodeon.nl", "videoland.nl", "youtubekids.com",
  ],
  Muziek: ["spotify.com", "soundcloud.com", "deezer.com", "tidal.com", "music.apple.com", "shazam.com", "bandcamp.com", "last.fm"],
  School: [
    "magister.net", "somtoday.nl", "wikipedia.org", "khanacademy.org", "duolingo.com", "quizlet.com", "kennisnet.nl", "classroom.google.com", "wikikids.nl",
    "schooltv.nl", "kahoot.it", "studenten.nl", "scholieren.com", "wrts.nl", "edubook.nl", "malmberg.nl", "noordhoff.nl", "thieme-meulenhoff.nl", "wikiwijs.nl", "digid.nl", "overheid.nl",
  ],
  Winkelen: [
    "amazon.com", "amazon.nl", "amazon.de", "bol.com", "coolblue.nl", "vinted.com", "vinted.nl", "marktplaats.nl", "zalando.nl", "shein.com", "temu.com", "aliexpress.com",
    "intertoys.nl", "smythstoys.com", "action.com", "hema.nl", "kruidvat.nl", "lidl.nl", "ah.nl", "jumbo.com", "etos.nl", "blokker.nl", "wehkamp.nl", "otto.de", "ebay.com", "etsy.com",
    "mediamarkt.nl", "xenos.nl", "hm.com", "zara.com", "primark.com", "decathlon.nl", "beslist.nl", "klarna.com", "mollie.com", "paypal.com", "toysandgarden.nl",
  ],
  Nieuws: ["nu.nl", "nos.nl", "telegraaf.nl", "ad.nl", "rtl.nl", "rtlnieuws.nl", "nrc.nl", "volkskrant.nl", "trouw.nl", "bbc.com", "cnn.com", "buienradar.nl", "buienalarm.nl", "weeronline.nl", "dpgmedia.nl", "ed.nl"],
  "AI & chat": ["chatgpt.com", "openai.com", "claude.ai", "anthropic.com", "gemini.google.com", "grok.com", "perplexity.ai", "character.ai", "copilot.microsoft.com", "midjourney.com"],
};

const LOOKUP = new Map<string, string>();
for (const [cat, domains] of Object.entries(CATS)) for (const d of domains) LOOKUP.set(d, cat);

export function categoryOf(site: string): string {
  return LOOKUP.get(site) ?? "Overig";
}

export const CATEGORY_NAMES = [...Object.keys(CATS), "Overig"];
