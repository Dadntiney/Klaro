import { NICE_NAME } from "./system.ts";
import { baseDomain } from "./parse.ts";
import { inAdultList, inDatingList } from "./adultlist.ts";
import { isEspDomain } from "./mail.ts";

/** Bekende apps/diensten: meerdere domeinen samengevoegd onder één naam. `icon` is het domein voor het favicon. */
const APPS: { name: string; icon: string; domains: string[] }[] = [
  { name: "YouTube", icon: "youtube.com", domains: ["youtube.com", "youtu.be", "ytimg.com", "googlevideo.com", "youtubekids.com", "youtube-nocookie.com", "yt3.ggpht.com", "yt3.googleusercontent.com"] }, // yt3.*: kanaalplaatjes
  { name: "Netflix", icon: "netflix.com", domains: ["netflix.com", "nflxvideo.net", "nflximg.net", "nflxext.com", "nflxso.net"] },
  { name: "Roblox", icon: "roblox.com", domains: ["roblox.com", "rbxcdn.com", "robloxlabs.com"] },
  { name: "Spotify", icon: "spotify.com", domains: ["spotify.com", "scdn.co", "spotifycdn.com"] },
  { name: "Shazam", icon: "shazam.com", domains: ["shazam.com", "shazamcloud.com"] }, // beacon.* elke paar minuten op de achtergrond; config/amp = app geopend
  { name: "Meditopia", icon: "meditopia.com", domains: ["meditopia.com", "meditationapp.co"] }, // meditatie-app (18 okt gevonden met controle 5b)
  { name: "TikTok", icon: "tiktok.com", domains: ["tiktok.com", "tiktokcdn.com", "tiktokv.com", "tiktokcdn-eu.com", "musical.ly", "byteoversea.com", "ibytedtos.com", "ibyteimg.com"] },
  { name: "Instagram", icon: "instagram.com", domains: ["instagram.com", "cdninstagram.com"] },
  { name: "Facebook", icon: "facebook.com", domains: ["facebook.com", "fbcdn.net", "facebook.net", "fb.com"] },
  { name: "WhatsApp", icon: "whatsapp.com", domains: ["whatsapp.com", "whatsapp.net"] },
  { name: "Pinterest", icon: "pinterest.com", domains: ["pinterest.com", "pinimg.com", "pinterest.nl"] },
  { name: "Snapchat", icon: "snapchat.com", domains: ["snapchat.com", "sc-cdn.net", "snap-dev.net"] },
  { name: "Discord", icon: "discord.com", domains: ["discord.com", "discordapp.com", "discordapp.net", "discord.gg", "discord.media"] },
  { name: "Twitch", icon: "twitch.tv", domains: ["twitch.tv", "ttvnw.net", "jtvnw.net", "twitchcdn.net"] },
  { name: "Minecraft", icon: "minecraft.net", domains: ["minecraft.net", "mojang.com", "minecraftservices.com", "minecraft-services.net",
    // servers in de lijst van het spel (worden bij openen allemaal even aangeklopt)
    "hivebedrock.eu", "hivebedrock.network", "lbsg.net", "lifeboat.games", "cubecraft.net", "galaxite.net", "enchanted.gg", "megasmp.gg", "inpvp.net", "donutsmp.org", "mineville.org"] },
  { name: "Epic Games / Fortnite", icon: "epicgames.com", domains: ["epicgames.com", "fortnite.com", "unrealengine.com", "epicgames.dev"] },
  { name: "Budge Studios (spel)", icon: "budgestudios.ca", domains: ["budgestudios.ca", "budgenetwork.com"] },
  { name: "GoFiev.nl", icon: "gofiev.nl", domains: ["gofiev.vercel.app", "gofiev.nl"] },
  // spellen: eigen servers van bekende games, zodat ze als app zichtbaar zijn
  { name: "Toca Boca (spel)", icon: "tocaboca.com", domains: ["tocaboca.com"] },
  { name: "Squla (leren)", icon: "squla.nl", domains: ["squla.nl"] },
  { name: "Candy Crush (spel)", icon: "king.com", domains: ["king.com", "candycrush.com"] },
  { name: "Subway Surfers (spel)", icon: "sybo.com", domains: ["sybo.com", "sybogames.com"] },
  { name: "Supercell (spel)", icon: "supercell.com", domains: ["supercell.com", "supercellid.com", "brawlstars.com", "clashofclans.com", "clashroyale.com", "haydaygame.com"] },
  { name: "Pokémon (spel)", icon: "pokemon.com", domains: ["pokemon.com", "pokemongolive.com", "nianticlabs.com", "pokemon-gl.com"] },
  { name: "Fortnite (spel)", icon: "fortnite.com", domains: ["fortnite.com", "epicgames.com", "unrealengine.com", "epicgames.dev"] },
  { name: "Among Us (spel)", icon: "innersloth.com", domains: ["innersloth.com"] },
  { name: "Talking Tom (spel)", icon: "outfit7.com", domains: ["outfit7.com", "talkingtomandfriends.com"] },
  { name: "Free Fire (spel)", icon: "garena.com", domains: ["garena.com", "freefiremobile.com", "freefireth.com"] },
  { name: "Genshin Impact (spel)", icon: "hoyoverse.com", domains: ["hoyoverse.com", "mihoyo.com", "yuanshen.com"] },
  { name: "Nintendo (spel)", icon: "nintendo.com", domains: ["nintendo.com", "nintendo.net"] },
  { name: "Angry Birds (spel)", icon: "rovio.com", domains: ["rovio.com"] },
  { name: "Playrix (spel)", icon: "playrix.com", domains: ["playrix.com"] },
  { name: "Mobile Legends (spel)", icon: "mobilelegends.com", domains: ["mobilelegends.com", "moonton.com"] },
  { name: "Sago Mini (spel)", icon: "sagomini.com", domains: ["sagomini.com"] },
  { name: "BoBo World (spel)", icon: "bobo-world.com", domains: ["bobo-world.com", "kalegames.com", "papoworld.com"] }, // kinderspel: start met svip./www.bobo-world + www.kalegames, tijdens spelen elke ~3-4 min cp.papoworld
  { name: "My Little Princess (spel)", icon: "my-little-princess.net", domains: ["my-little-princess.net"] }, // kinderspel (Unity) op de iPad sinds 19 okt: start met r2. + de Unity-spelmotor, daarna toca010-r2.; 25 okt 08:38-09:01 gespeeld maar nergens getoond
  { name: "Piknik (spel)", icon: "playpiknik.com", domains: ["playpiknik.com"] }, // kinderapp met Toca Boca- en Sago Mini-spellen (Unity); 22 okt 18:39 iPad: account-api.playpiknik.com bij het starten
  { name: "Amaya Kids (leren)", icon: "amayakids.com", domains: ["amayakids.com"] },
  { name: "LPRA Studio (spel)", icon: "lprastudio.net", domains: ["lprastudio.net"] }, // kinderspellen (prinsessen, opruimen, wassen) met Google-reclame; op de iPad sinds 26 okt: app. + www. samen met de reclame-onderdelen van een app (app-measurement, googleads)
  { name: "TutoTOONS (spel)", icon: "tutotoons.com", domains: ["tutotoons.com", "tutoads.tv"] }, // kinderspellen; tijdens het spelen elke paar minuten reclame/gegevens
  { name: "Spel (naam onbekend)", icon: "unity3d.com", domains: ["unity3d.com", "unity.com", "applovin.com", "ironsrc.com", "supersonicads.com", "vungle.com", "adcolony.com", "chartboost.com", "unityads.unity3d.com"] },
  // tv- en streamingapps (Apple TV, smart-tv): eigen servers, zodat kijken zichtbaar is
  { name: "Ziggo GO", icon: "ziggogo.tv", domains: ["ziggogo.tv", "horizon.tv", "dmdsdp.com"] }, // dmdsdp: videoplatform van Ziggo (hzn-nl, gnp.cloud), komt alleen samen met Ziggo GO voor
  { name: "NPO", icon: "npo.nl", domains: ["npo.nl", "npoplayer.nl", "npostart.nl", "omroep.nl", "npox.nl", "zappelin.nl", "zapp.nl", "npo3.nl", "nporadio1.nl", "nporadio2.nl", "npo3fm.nl"] }, // Zappelin/Zapp = NPO voor kinderen
  { name: "Kijk", icon: "kijk.nl", domains: ["kijk.nl"] },
  { name: "Videoland", icon: "videoland.com", domains: ["videoland.com", "bedrock.tech"] },
  { name: "Prime Video", icon: "primevideo.com", domains: ["primevideo.com", "aiv-cdn.net", "pv-cdn.net", "amazonvideo.com", "aiv-delivery.net"] }, // amazonvideo.com: de Prime Video-app zelf (Apple TV, 19 okt)
  { name: "Max", icon: "max.com", domains: ["max.com", "hbomax.com", "hbo.com"] },
  { name: "Viaplay", icon: "viaplay.com", domains: ["viaplay.com", "viaplay.nl"] },
  { name: "SkyShowtime", icon: "skyshowtime.com", domains: ["skyshowtime.com"] },
  { name: "Pathé Thuis", icon: "pathe-thuis.nl", domains: ["pathe-thuis.nl", "thuisbioscoop.nl", "force-public-alb-production-688060324.eu-central-1.elb.amazonaws.com"] }, // thuisbioscoop en de server erachter (laatste): de app meldt zich daar elke minuut tijdens een film
  { name: "F1 TV", icon: "formula1.com", domains: ["formula1.com", "watchliveformula1.com", "f1tv.com", "d8penbt6jsl3i.cloudfront.net"] }, // laatste: videoserver van F1 TV
  { name: "DAZN", icon: "dazn.com", domains: ["dazn.com", "indazn.com", "daznservices.com"] },
  { name: "NLZIET", icon: "nlziet.nl", domains: ["nlziet.nl"] },
  { name: "discovery+", icon: "discoveryplus.com", domains: ["discoveryplus.com", "discoveryplus.nl", "eurosport.com", "eurosport.nl"] },
  { name: "Ziggo Sport", icon: "ziggosport.nl", domains: ["ziggosport.nl"] },
  { name: "ESPN", icon: "espn.com", domains: ["espn.com", "espn.nl", "espncdn.com"] },
  { name: "Philips Hue", icon: "meethue.com", domains: ["meethue.com", "philips-hue.com"] },
  { name: "ChatGPT", icon: "chatgpt.com", domains: ["chatgpt.com", "openai.com", "oaiusercontent.com"] },
  { name: "Parro (school)", icon: "parro.com", domains: ["parro.com", "parnassys.net"] }, // ParnasSys is het schoolsysteem achter Parro
  { name: "Buienradar", icon: "buienradar.nl", domains: ["buienradar.nl"] },
  { name: "WebinarGeek (webinar)", icon: "webinargeek.com", domains: ["webinargeek.com"] },
  { name: "Kobo (e-books)", icon: "kobo.com", domains: ["kobo.com"] },
  { name: "Thinkific (cursus)", icon: "thinkific.com", domains: ["thinkific.com"] },
  { name: "X (Twitter)", icon: "x.com", domains: ["x.com", "twitter.com", "twimg.com", "t.co"] },
  { name: "Reddit", icon: "reddit.com", domains: ["reddit.com", "redd.it", "redditmedia.com", "redditstatic.com"] },
  { name: "Telegram", icon: "telegram.org", domains: ["telegram.org", "t.me", "telegram.me"] },
  { name: "Signal", icon: "signal.org", domains: ["signal.org", "signal.art"] },
  { name: "BeReal", icon: "bereal.com", domains: ["bereal.com", "bere.al"] },
  { name: "Buienalarm", icon: "buienalarm.nl", domains: ["buienalarm.nl", "meteoplaza.com", "infoplaza.io"] }, // weer-app van Infoplaza
  { name: "Weerplaza", icon: "weerplaza.nl", domains: ["weerplaza.nl"] },
  { name: "Waze", icon: "waze.com", domains: ["waze.com"] },
  { name: "Amazon", icon: "amazon.com", domains: ["a2z.com"] },
  { name: "Steam", icon: "steampowered.com", domains: ["steampowered.com", "steamcontent.com", "steamstatic.com", "steamcommunity.com", "steamserver.net"] },
  { name: "Disney+", icon: "disneyplus.com", domains: ["disneyplus.com", "disney-plus.net", "bamgrid.com", "dssott.com"] },
  { name: "Vinted", icon: "vinted.com", domains: ["vinted.com", "vinted.nl", "vinted.be", "vinted.de", "vinted.fr", "vinted.co.uk", "vintedapp.com", "vinted.net"] },
  { name: "Nintendo", icon: "nintendo.com", domains: ["nintendo.com", "nintendo.net"] },
  { name: "PlayStation", icon: "playstation.com", domains: ["playstation.com", "playstation.net", "sonyentertainmentnetwork.com"] },
  { name: "Xbox", icon: "xbox.com", domains: ["xbox.com", "xboxlive.com"] },
];

/** tv-apps: bij kijken meldt een apart adres (conviva) de voortgang; dat beeldverkeer hoort bij deze apps op hetzelfde apparaat. */
/**
 * Apps die op de achtergrond veel verversen (meldingen, verbinding openhouden). Alleen het laden van inhoud (foto's, video's,
 * profielfoto's, stickers) bewijst dat iemand de app echt open heeft; verbindingsadressen (graph, mqtt, gateway, chat) niet.
 */
export const FG_RULES: Record<string, RegExp> = {
  // netseer-ipaddr-assoc: netwerkmeting die de Facebook/Instagram-app alleen doet terwijl hij open staat (elke paar minuten);
  // tijdens scrollen worden foto's vaak niet opnieuw opgezocht, dus dit is dan het enige teken van gebruik. 's Nachts: nooit.
  "facebook.com": /^(scontent|video|static|external|lookaside)[^.]*\.([a-z0-9-]+\.)*fbcdn\.net$|^(m|web|touch|mbasic)\.facebook\.com$|-netseer-ipaddr-assoc\.[a-z]+\.fbcdn\.net$/,
  "instagram.com": /(^|\.)cdninstagram\.com$|^(scontent|instagram|video)[^.]*\.([a-z0-9-]+\.)*fbcdn\.net$|-netseer-ipaddr-assoc\.[a-z]+\.fbcdn\.net$/, // netseer: alleen als die bij Instagram hoort (lib/companion.ts)
  "whatsapp.com": /^(pps|static|mmg|media[^.]*|web)\.(cdn\.)?whatsapp\.(net|com)$|^graph\.whatsapp\.com$/,
  "tiktok.com": /tiktokcdn(-[a-z]+)?\.com$|(^|\.)ibyteimg\.com$/,
  // Google: alleen een echte zoekpagina (de Google-balk bovenaan, google.nl, afbeeldingen/lens); Foto's, Gmail en inlog-synchronisatie niet.
  "google.com": /^(www\.)?google\.(nl|be|de|fr|co\.uk)$|^ogads-pa\.clients6\.google\.com$|^encrypted-tbn\d\.gstatic\.com$|^(lens|images|translate|maps)\.google\.[a-z.]+$/,
  "youtube.com": /(^|\.)googlevideo\.com$|(^|\.)ytimg\.com$/,
  "snapchat.com": /(^|\.)sc-cdn\.net$/,
  // Pinterest: alleen foto's/video's (pinimg) bewijzen dat de app open is; de Pinterest-teller op webwinkels (ct., trk.) niet.
  "pinterest.com": /^(i|v[0-9]*)\.pinimg\.com$|^(i|v)[-.]pinimg/, // niet s.pinimg.com: dat is het Pinterest-script op webwinkels
};
/**
 * Kijkmeldingen: tijdens het afspelen meldt de speler de kijktijd aan de site zelf (YouTube: www.youtube.com, elke paar minuten
 * zodra het adres verlopen is). De video zelf komt dan vaak over een al open verbinding, zonder nieuwe opvragingen. Zo'n melding
 * telt alleen als hij aansluit op echte inhoud (hooguit 5 minuten na de vorige); een losse melding start nooit gebruik.
 */
// WhatsApp: de kale naam (whatsapp.com) vlak na een zeker geopende sessie = nog (of weer) in de app; maakt zelf geen nieuwe rij.
export const KEEP_ALIVE: Record<string, RegExp> = { "youtube.com": /^(www\.)?youtube\.com$/, "whatsapp.com": /^whatsapp\.com$/ };
export function isKeepAlive(site: string, host: string): boolean { return !!KEEP_ALIVE[site]?.test(host); }
/** Laadt dit adres inhoud van een app met achtergrondverkeer? `undefined` = geen achtergrond-app. */
/** Zelf geleerde bewijs-adressen per app (lib/selflearn.ts), naast de vaste FG_RULES. Adres met "*" = een willekeurig id-deel. */
const learnedFg = new Map<string, Set<string>>();
export function setLearnedFg(m: Map<string, Set<string>>) { learnedFg.clear(); for (const [k, v] of m) learnedFg.set(k, new Set(v)); }
export function fgHit(site: string, host: string): boolean | undefined {
  const r = FG_RULES[site];
  if (!r) return undefined;
  if (r.test(host)) return true;
  const l = learnedFg.get(site);
  return !!l && (l.has(host) || l.has(host.replace(/^[0-9a-f-]{36}(?=-)/, "*")));
}

/**
 * Losse onderdelen van een site die ook buiten de site zelf worden geladen: tellers en advertentiepixels (op andere webwinkels),
 * plaatjes en CDN (in mails, advertenties, andere apps), mail-onderdelen en lettertypes. Een "bezoek" dat alleen hieruit bestaat,
 * is geen bezoek. Zodra er iets van de site of app zelf bij zit (www., api., inloggen, app-server), telt het wel.
 */
const RESOURCE = /^(ct|trk|tr|t|s|px|pixel|pixels|log|logs|track|tracking|tracker|analytics|stats|metrics|bat|adsdk|ads?|adserver|c|th|assets?|static|statics|prod\.statics|media|images?|img|imgs|pics?|thumbs?|cdn[0-9-]*|emailassets|email|e|em|link|links|click|clicks|engage|subscriptions?|unsubscribe|admarkt-cdn|dualstack|fonts?|js|scripts?|widgets?|tags?|sst|collect|events?|beacon|insights|telemetry|rum|sentry|pagead)\.|\.map\.fastly\.net$|\.(cloudfront|akamaized|akamaihd)\.net$/;
export function isResourceHost(host: string): boolean {
  return RESOURCE.test(host);
}

/** Ingesloten spelers en onderdelen (óp een andere site): Vimeo-speler, YouTube zonder cookies, Wistia, Twitch-speler, embed.*. */
const EMBED = /^player\.vimeo\.com$|^(www\.)?youtube-nocookie\.com$|^fast\.wistia\.(com|net)$|^player\.twitch\.tv$|^embed\./; // embed.: een ingebouwd onderdeel (tool, formulier) in een andere site
export function isEmbedHost(host: string): boolean {
  return EMBED.test(host);
}

/**
 * Navigatie: onderweg haalt de app alleen af en toe nieuwe kaartstukjes en route-updates op (Waze: elke 4 tot 17 minuten), de
 * rest van de rit is het stil. Stukjes van zo'n app met hooguit NAV_GAP ertussen zijn één rit. Op de achtergrond vraagt Waze
 * niets op (over alle dagen: elk los stukje ligt binnen 17 minuten van het openen van de app).
 */
export const NAV_APPS = new Set(["waze.com"]);
export const NAV_GAP = 20 * 60_000;
/** Apps die tijdens gebruik een vaste melding sturen via een doorverwijs-adres (zie followers() in lib/companion.ts): meestal elke
 * 1 tot 5 minuten, soms tot 10 (over alle dagen bij Toca Boca); langer is een echte pauze. */
export const HEARTBEAT_GAP = 10 * 60_000;
/** Spel dat echt opstartte: de spelmotor meldt zich tijdens het spelen elke 5 min (gemeten: bijna alle gaten precies 5,0 min, hooguit
 *  6,8). Een gat van 8-10 min betekent dat er een melding mist: dan lag het spel stil (26 okt LPRA 15:54-16:04: iPad ververste
 *  ondertussen widgets op de achtergrond). Dus stukjes met hooguit 7 min ertussen zijn één keer spelen. */
export const GAME_GAP = 7 * 60_000;
export const TV_APPS = new Set(["disneyplus.com", "ziggogo.tv", "npo.nl", "kijk.nl", "videoland.com", "primevideo.com", "max.com", "viaplay.com", "skyshowtime.com", "pathe-thuis.nl", "formula1.com", "dazn.com", "nlziet.nl", "discoveryplus.com", "ziggosport.nl", "espn.com"]);

const APP_BY_DOMAIN = new Map<string, (typeof APPS)[number]>();
for (const a of APPS) for (const d of a.domains) APP_BY_DOMAIN.set(d, a);

/** Infrastructuur, advertenties, telemetrie: verkeer van het apparaat zelf, geen bewust bezoek. */
const BACKGROUND = new Set([
  // chatknoppen die in andere sites zitten (geen eigen bezoek)
  "replain.cc", "tolkie.nl", "surfly.com", "usizy.com", "snapwidget.com", "giftomatic.io", "shopboostapp.com", "omniconvert.com", "masslytics.io", "klarnaevt.com", "intercom.io", "intercomcdn.com", "intercomassets.com", "zdassets.com", "tawk.to", "crisp.chat", "livechatinc.com", "tidio.co", "tidiochat.com", "driftt.com", "usemessages.com", "olark.com", "jivosite.com", "judge.me", "shop.app", "whale.camera", "whaledb.io", "cloudflare.com", "sovendus.com", "sovendus-connect.com", "redbrain.shop", "pubmetric.com", "closersuite.io", "launchdarkly.com", "ampaeservices.com", "chatbase.co", "dwin1.com", "dwin2.com", "awin1.com", "zenaps.com", "youshouldask.ai", "hcaptcha.com", "wepowerconnections.com", "placehold.co", "placeholder.com", // placehold.co: vervang-plaatjes die een betaalpagina laadt (24 okt); // chatknop (Scapino, 9 van 9 keer met de winkel), captcha bij afrekenen, affiliateteller; // Awin (dwin1/dwin2/awin1/zenaps): affiliate-teller die webwinkels meeladen (21 okt: dwin2.com met go-kids.nl, eigenaar "niet gebruikt"); chatbase: AI-chatknop; judge.me (reviews) en shop.app (Shop Pay-knop) zitten in Shopify-winkels (28 van 31 keer tegelijk met de winkel); whale.camera/api.whaledb.io: video-onderdeel van een Shopify-winkel (26 okt, 8 van 8 keer in dezelfde seconde als de winkel); cloudflare.com (cp4, apple-relay, radar, www): netwerk en meting die winkels en iCloud meeladen, geen bezoek (warp. blijft VPN, die regel gaat voor); sovendus(-connect): kortingsbon-widget na het afrekenen; redbrain.shop: doorstuur-link van een prijsvergelijker; pubmetric.com: advertentieteller; closersuite.io: script dat met een webinarpagina meelaadt (26 okt, alle keren in dezelfde seconde als de echte site); launchdarkly.com: instellingen-dienst (feature flags) die een website meelaadt (27 okt, met raisin.com in dezelfde seconde); ampaeservices.com: Apple-onderdeel van de App Store (afs., bij kopen/downloaden, 27 okt)
  "stripe.com", "msidentity.com", "microsoftonline.com", "msauth.net", "msftauth.net",
  // doorstuur-links (je komt er nooit op, je gaat er doorheen) en inlog/privacy van mediabedrijven achter nieuwssites
  "ift.tt", "bit.ly", "tinyurl.com", "awin1.com", "tradetracker.net", "go2cloud.org", "bigspark.link", // ook affiliate-links
   "ow.ly", "buff.ly", "lnkd.in", "goo.gl", "rebrand.ly", "dpgmedia.nl", "dpgmedia.net", "dpgmedia.cloud", "mediahuis.nl", "telegraaf-login.nl", "shopifycloud.com", "shopifysvc.com",
  // techniek, meetdiensten en apparaat-clouds die nooit een bewust bezoek zijn
  "tm-azurefd.net", "azurefd.net", "t-msedge.net", "fastly-masque.net", "impervadns.net", "akaquill.net", "visualwebsiteoptimizer.com", "at-o.net", "wt-eu02.net", "snplow.net", "nr-data.net", "marketingcloudapis.com", "rudderlabs.com", "ecomm.events", "kameleoon.eu", "tealiumiq.com", "contentsquare.net", "blueconic.net", "mparticle.com", "dynatrace.com", "usabilla.com", "typekit.net", "addthis.com", "privacy-center.org", "tuyaeu.com", "tuyaus.com", "tuyacn.com", "webwinkelkeur.nl", "kiyoh.com", "trustpilot.com", "trustedshops.com", "trustedshops.nl", "feedbackcompany.com", "thuiswinkel.org", 
  "gstatic.com", "googleapis.com", "googleusercontent.com", "google-analytics.com", "googletagmanager.com",
  "googletagservices.com", "doubleclick.net", "googlesyndication.com", "googleadservices.com", "gvt1.com", "gvt2.com",
  "app-measurement.com", "crashlytics.com", "firebaseio.com", "firebaseinstallations.googleapis.com",
  "ipapi.co", "ipify.org", // "wat is mijn IP/land"-diensten die apps bij het opstarten aanroepen (een kinder-app op de iPad: ipapi.co), geen bezoek
  "akamaihd.net", "akamaiedge.net", "akamai.net", "edgekey.net", "edgesuite.net", "cloudfront.net", "fastly.net",
  "fastlylb.net", "azureedge.net", "trafficmanager.net", "amazonaws.com", "windowsupdate.com", "msftconnecttest.com",
  "msftncsi.com", "apple-dns.net", "mzstatic.com", "icloud-content.com", "sentry.io", "appsflyer.com", "adjust.com",
  "branch.io", "scorecardresearch.com", "cloudflare-dns.com", "nextdns.io", "ntp.org", "arpa", "local", "lan", "home", "localdomain", "internal", "intranet", "corp", "router",
  "microsoft.com", "windows.com", "live.com", "office.com", "office365.com", "skype.com", "office.net",
  // reclame-, betaal-, chat- en mailwidgets die in andermans site zitten
  "dpgmedia.net", "stripe.network", "omnidesk.io", "belco.io", "vidyard.com", "cm.com", "editorify.net", "ccvshopserver.nl", "mailplus.nl", "laposta.nl",
  // meet- en slimme-dns-diensten die alleen meekomen met een app
  "swrve.com", "ankersmartdns.com", "fastly-insights.com", "prodregistryv2.org", // meetbaken van Fastly op websites; register-adres dat met apps meekomt
  // inlogdiensten: komen mee bij elke app die inlogt (Outlook, Teams, Office), geen bezoek aan een site
  "microsoftonline.com", "msauth.net", "msftauth.net", "cloud.microsoft", "microsoftpersonalcontent.com", "okta.com", "oktapreview.com", "auth0.com", "onelogin.com",
]);
/** Trefwoorden in het adres die duiden op statistieken, advertenties, foutrapportage of hulpdiensten van apps. */
const BACKGROUND_KEYWORDS = [
  "analytics", "telemetry", "tracking", "tracker", "metrics", "adservice", "adsystem", "adserver", "adnxs", "pixel", "beacon",
  "statistic", "crash", "bugsnag", "sentry", "appsflyer", "amplitude", "mixpanel", "braze", "onesignal", "firebase", "newrelic",
  "datadog", "hotjar", "optimizely", "criteo", "taboola", "outbrain", "rubiconproject", "pubmatic", "openx", "moatads", "2mdn",
  "msedge.net", "quantserve", "demdex", "omtrdc", "adobedtm", "consent", "cookie", "akadns", "cloudfront", "cdn", "static", "assets",
  // gevonden in echte logs: advertentie-, tracking-, e-mail- en hulpdiensten
  "adsafeprotected", "adsrvr", "applovin", "btloader", "clarity.ms", "clevertap", "content-loader", "dwin1", "error-report", "googleoptimize",
  "html-load", "id5-sync", "igodigital", "kickbite", "linkdirects", "loox.io", "mandrillapp", "mcusercontent", "list-manage", "mailchimp",
  "notificationredirection", "plausible", "powr.io", "publize", "px-cloud", "pzapi", "recaptcha", "redirectoffertrack", "salecycle", "sendgrid",
  "squeezely", "statcounter", "syndicatedsearch", "trackall", "trk42", "trustus", "unpkg", "usercentrics", "vercel.live", "framerusercontent",
  "lottie.host", "noembed", "gravatar", "gorgias", "smartsuppchat", "hellodialog", "flowmailer", "captcha-delivery", "scene7", "zupimages",
  "img-cache", "gtm-", "googletag", "adform", "smartadserver", "bidswitch", "casalemedia", "lijit", "sharethrough", "teads", "yieldmo",
  "media-amazon", "ssl-images-amazon", "images-amazon", "amazon-adsystem", "amazonaws", "awsstatic", "-services.", "-api.", "-sdk",
];
/** Domeinen die als losse apex vrijwel alleen door apps worden opgevraagd; een echte bezoek loopt via www./een taalvariant. */
const APEX_NOISE = /^(google|apple|icloud|microsoft|amazon|facebook|instagram|whatsapp|bing|yahoo)\.[a-z.]+$/;

const APP_TRACKERS = ["ads-twitter.com", "ads-api.twitter.com", "analytics.twitter.com", "syndication.twitter.com", "platform.twitter.com", "alb.reddit.com", "events.reddit.com", "events.redditmedia.com", "pixel-config.reddit.com",
  "devices.a2z.com", // apparaat-statistieken van Amazon (Minerva): ook als de app op de achtergrond ververst
  "beacon.shazam.com", // Shazam meldt zich dag en nacht elke paar minuten, ook als de app dicht is
  "bzr.openai.com", "bzrcdn.openai.com", // advertentie-teller van OpenAI op webwinkels (ook in de ChatGPT-app, maar daar komen altijd eigen adressen mee)
  // bestanden van cursusplatform Thinkific in de eigen cursus-site (academy.merk.nl): die site is het bezoek, niet Thinkific
  "cdn.thinkific.com", "assets.thinkific.com", "cdn-internal.thinkific.com", "cdn-themes.thinkific.com"];
const BACKGROUND_SUFFIX = ["csva.vercel.app", "pichya.nl", "bat.bing.com", "c.bing.com", "th.bing.com", // Klaro zelf (oud en nieuw adres); advertentietellers/plaatjes van Microsoft in andere sites
  "push.apple.com", "ls.apple.com", "gateway.icloud.com", "play.googleapis.com", "mtalk.google.com", "connectivitycheck.gstatic.com",
  // onderdelen van WordPress-sites (plaatjes, statistiek, inlog, like-knop) en van blog-widgets (pzz.*: laden in dezelfde seconde als de blog, 28 okt); een blog zelf (naam.wordpress.com) blijft gewoon zichtbaar
  "jetpack.wordpress.com", "public-api.wordpress.com", "r-login.wordpress.com", "files.wordpress.com", "wp.com", "pzz.to", "pzz.io", "pzz.events"];
const BACKGROUND_LABELS = new Set(["telemetry", "metrics", "analytics", "ocsp", "crl", "time", "ntp", "captive", "settings-win", "update", "updates", "stats", "tracking", "events", "log", "logs", "beacon", "adservice", "ads"]);

/** 18+: pornografie en erotische webshops. Bewust voorzichtig: lange, ondubbelzinnige namen als deel van het domein, korte woorden alleen als los woord. */
const ADULT_PARTS = [
  "porn", "xxx", "hentai", "nsfw", "onlyfans", "chaturbate", "xvideos", "xnxx", "xhamster", "redtube", "youporn",
  "stripchat", "bongacams", "livejasmin", "brazzers", "rule34", "camsoda", "fansly", "spankbang", "eporner",
  "nhentai", "literotica", "sexcam", "sexchat", "sexdate", "sexfilm", "playboy",
  // erotische webshops
  "sexshop", "sex-shop", "eroticashop", "erotiekshop", "erotiek", "dildo", "vibrator", "bdsm", "fetish",
  "lovehoney", "amorelie", "beate-uhse", "beateuhse", "adameve", "satisfyer", "womanizer", "christineleduc",
  // overig
  "pussy", "fuck", "slut", "xvideo", "sexvid", "pornhub", "hotwife", "bukkake", "camwhore", "cumshot", "gangbang", "blowjob",
  "sextoy", "lovetoy", "adulttoy", "sexspeeltje", "sexspeeltjes", "seksshop", "sekscontact", "seksdate", "sekschat", "seksfilm", "seksspeeltje", "seksspeeltjes", "seksafspraak", "sekswinkel", "seksbioscoop", "neuken", "tieten", "easytoys", "sexcontact", "sexafspraak", "sexdating", "livecams", "freecams", "erocams", "adultcams", "nudecams", "sexgames", "hotcams",
  "sexy", "neukvriend", "neukafspraak", "neukcontact", "neukdate", "seksverha", "sexverha", "seksfoto", "sexfoto", "fapnation", "fapello", "fapopedia",
  // AI-"uitkleed"-apps en NSFW-chatbots
  "camgirl", "camboy", "erotisch", "pleasureshop", "lustshop", "lingerie-erotiek",
  // meer ondubbelzinnige woorden (Engels en Nederlands)
  "creampie", "deepthroat", "handjob", "titty", "titties", "boobs", "busty", "horny", "nympho", "cuckold", "shemale", "tranny", "ladyboy",
  "upskirt", "voyeur", "lolicon", "incest", "orgasm", "masturb", "erotik", "pr0n", "p0rn", "milf", "naakt", "tietjes", "sletje", "kutje",
  "escortservice", "escortgirl", "sugardadd", "sugarbab", "nudist", "nudes", "nudecam", "jerkoff", "camshow", "strippers", "stripclub",
  "fanvue", "loyalfans", "fancentro", "justforfans", "mym.fans", "admireme", "4based", "pocketstars", "ismygirl", "unfiltrd",
  // AI-vriendin / NSFW-chatbots
  "candy.ai", "crushon.ai", "janitorai", "spicychat", "muah.ai", "nastia.com", "girlfriendgpt", "dreamgf", "kupid.ai", "ourdream.ai", "promptchan", "seduced.ai", "soulgen", "pornpen",
  "clothoff", "nudify", "undress", "deepnude", "nudifier", "pornify",
];
/**
 * "sex"/"seks" komt ook midden in gewone woorden voor (Essex, unisex, correosexpress, tennisexplorer). Daarom alleen als het
 * woord los staat (begin, na een cijfer/streepje/punt) of gevolgd wordt door een duidelijk seksueel vervolg (sexcam, seksfilm, sexy).
 */
const SEX_IN_WORD = /(^|[^a-z])(sex|seks)|(sex|seks)(y|o(?![a-z])|e(?![a-z])|x|[0-9]|-|\.|film|cam|chat|club|shop|stor|vid|tub|toy|dat|hub|tape|site|game|kontakt|contact|pic|foto|photo|movie|clip|porn|live|doll|work|party|slav|tour|guide|gids|zone|web|tv|hd|winkel|verhal|speel|afspra|bioscoop|relatie)|(^|[^a-z])neuk|neuk(en|vriend|afspra|contact|dat|film|tok|seks|sex|buddy|maat|meid|wijf)/;
/** Gewone woorden waar toevallig een verdacht stukje in zit; die worden eerst weggehaald. */
const SEX_INNOCENT = /(sussex|essex|wessex|middlesex|unisex|expertsex|sextant|sexton|sextet|sexual|sexis|sekse|seksu|seksis|neukirch|neukoe|neukö|neukolln|milford|thorny|anastasia|scunthorpe|middlesbrough|jeuxvideo|xxxlutz|slutsk|strannye|bdsmoto|aktivitet|tietenn|tietend|chorny|deusex|sexpe|emilf|sexto|nude-project)/g;
/** Erotische webshops (NL/BE/DE/EN) als exacte basisdomeinen; de grote lijst mist vooral lokale winkels. */
const SEXSHOP_DOMAINS = new Set([
  "amorelie.nl", "amorelie.de", "amorelie.be", "amorelie.at", "amorelie.ch", "amorelie.fr", "amorelie.com", "lovehoney.nl", "lovehoney.com",
  "lovehoney.co.uk", "lovehoney.de", "lovehoney.com.au", "christine-le-duc.nl", "christine-le-duc.com", "christineleduc.com",
  "christineleduc.nl", "beate-uhse.com", "beate-uhse.de", "orion.de", "orion-versand.de", "fun-factory.com", "fleshlight.com",
  "tenga.co", "tenga-global.com", "dorcel.com", "dorcelstore.com", "adameve.com", "babeland.com", "goodvibes.com", "lovense.com",
  "lelo.com", "we-vibe.com", "ohmibod.com", "njoy.com", "svakom.com", "calexotics.com", "doc-johnson.com", "pipedreamproducts.com",
  "bad-dragon.com", "annsummers.com", "ann-summers.com", "bijoux-indiscrets.com", "satisfyer.com", "womanizer.com", "durexshop.nl",
  "sinful.nl", "erotiekmarkt.nl", "intimteam.nl", "lingerie-erotiek.nl", "sexshopxl.nl", "kinky-store.nl", "mister-b.com", "misterb.com",
  "xtoys.app", "sextoys.nl", "sextoys.be", "sextoys.com", "toyjoy.com", "pleasurebox.nl", "peepshow.nl", "naughty-nederland.nl",
  "eroticashop.nl", "eroticaplanet.nl", "erotiekshop.nl", "bol-erotiek.nl", "joyclub.nl", "joyclub.de", "shop-erotiek.nl",
  "oproepjes.nl", "sexjobs.nl", "kinky.nl", "redlights.nl", "hookers.nl",
]);

const ADULT_WORDS = new Set(["seks", "geil", "neuk", "vagina", "penis", "sex", "sexy", "sexo", "sexe", "erotic", "erotica", "erotiek", "escort", "escorts", "camgirl", "camgirls", "nude", "nudes", "milf", "xvids", "tube8", "hentai", "lust", "naughty", "kinky"]);
const ADULT_TLDS = new Set(["xxx", "adult", "sex", "porn", "sexy"]);

/** Datingsites en -apps. Ambiguë namen alleen als exact basisdomein. */
const DATING_PARTS = [
  "dating", "tinder", "badoo", "grindr", "okcupid", "parship", "eharmony", "meetic", "zoosk", "happn", "ashleymadison",
  "adultfriendfinder", "benaughty", "relatieplanet", "flirt", "victoriamilan", "elitesingles", "silversingles", "christianmingle",
  "jdate", "ourtime", "seniorpeoplemeet", "plentyoffish", "datemyage", "c-date", "lovescout", "elitepartner", "friendscout",
  "singleboerse", "gaydar", "growlr", "scruff", "jackd", "taimi", "meetme", "mocospace", "datingjungle", "flirtfair",
  "omegle", "chatroulette", "emeraldchat", "monkey.app", "singles", "hookup", "lovoo", "jaumo", "mamba.ru", "loveawake",
  "sugardaddy", "sugarbaby", "sugardating", "affairdating", "overspel", "slippertje", "secondlove", "speeddate", "speeddating", "datingapp", "datingsite", "lovematch", "sexdating",
];
/** Exacte sites; voor namen die als woord te algemeen zijn. */
const DATING_DOMAINS = new Set([
  "bumble.com", "hinge.co", "match.com", "pof.com", "feeld.co", "raya.app", "lexa.nl", "seeking.com", "coffeemeetsbagel.com",
  "boo.world", "mingle2.com", "fruitz.io", "inner-circle.com", "theinnercircle.co", "twoo.com", "skout.com", "jaumo.com",
  "hily.com", "tantan.com", "her.app", "wapa.app", "hornet.com", "thursday.app", "chemistry.com", "ome.tv", "azar.live",
  "yubo.live", "tagged.com", "datingapp.nl", "lovestruck.com", "bumbleapp.com", "gotinder.com", "tinderchallenge.com",
  "sugardaddy.com", "seekingarrangement.com", "whatsyourprice.com", "luxy.com", "thecoffeemeetsbagel.com", "clover.co",
  "pairs.lv", "omiai-jp.com", "tapple.me", "paktor.com", "hello.talk", "mamba.ru", "badoo.com", "lovoo.com",
  // vrienden-/chat-apps met vreemden (veel gebruikt door tieners, ook voor daten)
  "wink.app", "getwizz.com", "wizz.chat", "azarlive.com", "holla.world", "inner-circle.co", "raya.co", "rayatheapp.com", "hoop.photo", "monkey.cool", "chatrandom.com",
  "camsurf.com", "shagle.com", "joingy.com", "chatspin.com", "bazoocam.org", "tinychat.com", "emeraldchat.com", "chathub.cam", "uhmegle.com",
]);

export function isDating(host: string): boolean {
  return DATING_DOMAINS.has(baseDomain(host)) || DATING_PARTS.some((p) => host.includes(p)) || inDatingList(host);
}

export function isAdult(host: string): boolean {
  const labels = host.split(".");
  if (ADULT_TLDS.has(labels[labels.length - 1])) return true;
  if (inAdultList(host) || SEXSHOP_DOMAINS.has(baseDomain(host))) return true;
  const clean = host.replace(SEX_INNOCENT, ""); // gewone woorden waar toevallig een verdacht stukje in zit
  if (ADULT_PARTS.some((p) => clean.includes(p))) return true;
  if (clean.split(".").some((l) => l.split("-").some((w) => ADULT_WORDS.has(w)))) return true;
  const name = labels.slice(0, -1).join("."); // zonder extensie
  return SEX_IN_WORD.test(name.replace(SEX_INNOCENT, ""));
}

export interface SiteInfo {
  site: string; // groeperingssleutel
  name: string; // weergavenaam
  icon: string; // domein voor het favicon
  bg: boolean; // achtergrondverkeer
  adult: boolean; // 18+
  main: boolean; // lijkt een hoofdadres (zoals www.site.nl of site.nl) in plaats van een hulpadres (cdn, api, ...)
  flag?: string; // reden voor de rode balk: "18+" of de naam van een gemarkeerde app
}

/** Apps die ook de rode markering activeren (nu geen). */
const ALERT_APPS = new Set<string>();

/** Hoofdadres: het domein zelf, www., een taal-/mobiele variant (nl., m.). Hulpadressen als cdn., api., static. tellen niet. */
const LANG = new Set("nl en de fr es it pt be uk us da sv no fi pl ru ja zh ko ar tr cs hu ro el he sk bg hr sl lt lv et nb nn id vi th hi fa ca eu gl is ga mt sq sr uk ms".split(" "));

/** Inlog- of bankierpagina van een site (bankieren.rabobank.nl, mijn.ing.nl, login.merk.nl): wordt alleen bewust geopend. */
export function isLoginHost(host: string): boolean {
  return /^(bankieren|internetbankieren|mijn|inloggen|login)\./.test(host) && !classify(host).bg;
}

export function isMainHost(host: string, base: string): boolean {
  if (host === base) return !APEX_NOISE.test(base);
  if (!host.endsWith("." + base)) return false;
  const rest = host.slice(0, host.length - base.length - 1);
  if (rest === "www") return base !== "apple.com"; // www.apple.com wordt elk uur door apparaten zelf opgevraagd
  // Bij grote partijen (Apple, Google, Amazon, ...) is alleen www. een echt bezoek; de rest is systeem- of app-verkeer.
  if (APEX_NOISE.test(base)) return false;
  // Adressen waarachter meestal echt een bezoek zit (mijn.postnl.nl, shop.lego.com, webmail.provider.nl), geen hulpdienst; mail.merk.nl is nieuwsbrief-verkeer, geen bezoek.
  const PORTAL = ["m", "web", "app", "mobile", "mijn", "my", "login", "inloggen", "shop", "webshop", "store", "portal", "academy", "learn", "leren", "cursus", "courses", "webmail", "chat", "play", "music", "news", "nieuws", "online", "bankieren", "internetbankieren", "mijnzaken"];
  return LANG.has(rest) || PORTAL.includes(rest);
}

/** VPN's, proxy's, Tor en DNS-diensten waarmee het filter van NextDNS kan worden omzeild. */
const VPN_DOMAINS = new Set([
  "nordvpn.com", "nordcdn.com", "nordaccount.com", "expressvpn.com", "protonvpn.com", "surfshark.com", "privateinternetaccess.com", "cyberghostvpn.com",
  "tunnelbear.com", "windscribe.com", "mullvad.net", "hide.me", "hotspotshield.com", "ipvanish.com", "torguard.net", "vyprvpn.com", "atlasvpn.com", "hola.org",
  "psiphon.ca", "getlantern.org", "lantern.io", "torproject.org", "ultrasurf.us", "vpnunlimited.com", "keepsolid.com", "betternet.co", "turbovpn.com", "vpnbook.com",
  "proxysite.com", "hidemyass.com", "hma.com", "croxyproxy.com", "kproxy.com", "hidester.com", "vpn.net", "zenmate.com", "purevpn.com", "ivacy.com", "x-vpn.com",
  "cloudflareclient.com", "warp.plus", "warp.cloudflare.com", "speedify.com", "urban-vpn.com", "ghostery.com", "opera-proxy.net", "browsec.com", "veepn.com", "planetvpn.com", "snapvpn.com",
  // DNS-over-HTTPS / eigen DNS-diensten: wie die gebruikt, omzeilt NextDNS
  "vpn-api.proton.me", "psiphon3.com", "tor2web.org", "onion.ws", "onion.ly", "onion.pet",
  "dns.google", "dns.quad9.net", "controld.com", "dns0.eu", "one.one.one.one", "adguard-dns.io", "libredns.gr", "doh.mullvad.net", "dns.sb", "alidns.com", "doh.pub", "doh.opendns.com", "cloudflare-dns.com", "dns.adguard.com", "dns.adguard-dns.com", "dnsforge.de", "doh.dns.sb", "mullvad-dns.net",
]);
const VPN_PARTS = ["vpn", "proxysite", "unblock-"];
// Bewust niet: mask.icloud.com en apple-dns.net. Apple-apparaten vragen die altijd op (ook met Private Relay uit), dus dat zou continu vals alarm geven.
const VPN_SUFFIX: string[] = [];

function isVpn(host: string): boolean {
  const base = baseDomain(host);
  if (VPN_DOMAINS.has(base) || VPN_DOMAINS.has(host)) return true;
  if (VPN_SUFFIX.some((x) => host === x || host.endsWith("." + x))) return true;
  return VPN_PARTS.some((p) => base.split(".")[0].includes(p));
}

/** Nooit rood markeren, ook niet als een lijst ze (ten onrechte) bevat. */
// Door de eigenaar goedgekeurd (staat op een 18+-lijst, maar is dat voor ons gezin niet): vkmag.com (mannenblad, artikelen via Facebook).
const NEVER_FLAG = new Set(["vkmag.com", "list-manage.com", "mailchimp.com", "mcusercontent.com", "sendgrid.net", "mandrillapp.com", "google.com", "youtube.com", "facebook.com", "instagram.com", "microsoft.com", "apple.com", "amazon.com", "wikipedia.org", "reddit.com", "twitter.com", "x.com"]);
/** Staat dit adres bewust op "nooit rood" (door de eigenaar goedgekeurd of een bekende dienst)? */
export function isNeverFlag(host: string): boolean {
  return NEVER_FLAG.has(baseDomain(host));
}

const memo = new Map<string, SiteInfo>();

/** Beoordeel een adres; het resultaat wordt onthouden, want dezelfde adressen komen duizenden keren voor. */
export function classify(host: string): SiteInfo {
  let info = memo.get(host);
  if (!info) {
    info = classifyUncached(host);
    if (memo.size > 200_000) memo.clear();
    memo.set(host, info);
  }
  return info;
}

/** Landvarianten van dezelfde dienst samenvoegen (google.nl en google.com zijn één regel). */
/** Merken met meer dan een domein: samen één regel (zonder hun hulpadressen zichtbaar te maken). */
const BRAND_CANON: Record<string, string> = {
  "paypalobjects.com": "paypal.com", "paypal.me": "paypal.com",
  "lidl.com": "lidl.nl", "lidl.de": "lidl.nl", "lidl.be": "lidl.nl", "lidlplus.nl": "lidl.nl", "lidlplus.com": "lidl.nl",
  "marktplaats.com": "marktplaats.nl",
  "kruidvat.be": "kruidvat.nl",
  "rabobank.com": "rabobank.nl",
  "decathlon.net": "decathlon.nl", "decathlon.com": "decathlon.nl",
  "s-bol.com": "bol.com", "bol.nl": "bol.com",
  "eufylife.com": "eufy.com", // zelfde eufy-camera-app (security-app-eu., care-app-eu.): 89 van 108 keer samen met eufy.com (28 okt)
};
const niceName = (site: string) => NICE_NAME[site] ?? site;

function canonSite(base: string): string {
  if (/^google\.[a-z.]+$/.test(base)) return "google.com";
  if (/^amazon\.[a-z.]+$/.test(base)) return "amazon.com";
  return BRAND_CANON[base] ?? base;
}

function classifyUncached(host: string): SiteInfo {
  // Omweg via Google Translate (www-pornhub-com.translate.goog) of een andere vertaal-/cacheproxy: beoordeel de echte site erachter.
  const proxied = host.match(/^([a-z0-9-]+)\.translate\.goog$/);
  if (proxied) {
    const real = proxied[1].replace(/--/g, "\u0000").replace(/-/g, ".").replace(/\u0000/g, "-");
    const r = classify(real);
    if (r.flag) return r;
  }
  // Plaatjes in Google-zoekresultaten horen bij de zoekopdracht (Google), niet bij gstatic (systeem).
  if (/^encrypted-tbn\d\.gstatic\.com$/.test(host)) return { site: "google.com", name: "Google", icon: "google.com", bg: false, adult: false, main: false };
  const base = baseDomain(host);
  const app = APP_BY_DOMAIN.get(host.replace(/^www\./, "")) ?? APP_BY_DOMAIN.get(base); // ook een volledig adres (zoals gofiev.vercel.app) kan een app zijn
  // Advertentie-/meetadressen van apps die in andere sites en apps zitten (knoppen, pixels): geen gebruik van die app.
  if (app && APP_TRACKERS.some((t) => host === t || host.endsWith("." + t))) return { site: app.icon, name: app.name, icon: app.icon, bg: true, adult: false, main: false };
  if (app) return { site: app.icon, name: app.name, icon: app.icon, bg: false, adult: false, main: true, flag: ALERT_APPS.has(app.name) ? app.name : undefined };
  // Eerst dating: sommige datingsites staan ook op de porno-lijst, maar het label Dating is dan duidelijker.
  // VPN/proxy en DNS-omzeiling eerst: altijd zichtbaar en rood, ook als het eigenlijk hulpverkeer is.
  if (!NEVER_FLAG.has(base) && isVpn(host)) return { site: canonSite(base), name: canonSite(base), icon: canonSite(base), bg: false, adult: false, main: true, flag: "VPN/proxy" };
  const never = NEVER_FLAG.has(base);
  const dating = !never && isDating(host);
  const adult = !never && !dating && isAdult(host);
  const label = host.split(".")[0];
  const bg =
    !adult && !dating && (BACKGROUND.has(base) || isEspDomain(host) ||
    BACKGROUND_SUFFIX.some((s) => host === s || host.endsWith("." + s)) ||
    (host !== base && BACKGROUND_LABELS.has(label)) ||
    BACKGROUND_KEYWORDS.some((k) => host.includes(k)) ||
    BACKGROUND.has(host.split(".").slice(-1)[0]));
  const flag = adult ? "18+" : dating ? "Dating" : undefined;
  return { site: canonSite(base), name: niceName(canonSite(base)), icon: canonSite(base), bg, adult, main: !!flag || isMainHost(host, base), flag };
}

/** Betaalmomenten. "checkout" is betrouwbaar (iDEAL, afrekenpagina, PayPal); "store" (App Store) kan ook achtergrondverkeer zijn. */
export function payKind(host: string): { kind: string; level: "checkout" | "store" } | null {
  if (host === "pay.ideal.nl" || host.endsWith(".ideal.nl") || host.endsWith("idealapi.nl")) return { kind: "iDEAL", level: "checkout" };
  if (host === "www.paypal.com" || host === "paypal.com") return { kind: "PayPal", level: "checkout" };
  if (/^checkout\./.test(host)) return { kind: "Afrekenpagina", level: "checkout" };
  if (/^(p\d+-)?buy\.itunes\.apple\.com$/.test(host)) return { kind: "App Store", level: "store" };
  return null;
}

/** Verkeer van video-, muziek- en beeldservers: dat wijst op echt kijken of luisteren, niet op een app die op de achtergrond staat. */
const MEDIA = [
  /(^|\.)googlevideo\.com$/, /(^|\.)nflxvideo\.net$/, /(^|\.)ttvnw\.net$/, /tiktokcdn(-[a-z]+)?\.com$/, /(^|\.)cdninstagram\.com$/,
  /^(scontent|video)[^.]*\.([a-z0-9-]+\.)*fbcdn\.net$/, /(^|\.)dssott\.com$/, /playback\.edge\.bamgrid\.com$/, /(^|\.)audio-[^.]*\.(spotifycdn\.com|scdn\.co|akamaized\.net)$/, /(^|\.)scdn\.co$/,
  /^ott-video[^.]*\.formula1\.com$/, /^d8penbt6jsl3i\.cloudfront\.net$/, // F1 TV: video van de race
  /(^|\.)conviva\.com$/, /(^|\.)(aiv-cdn|pv-cdn)\.net$/, // conviva meldt de voortgang van video aan de aanbieder: er wordt gekeken
];
/** Plaatjes van titels in een kijk-app (Netflix): de app is open en er wordt gekozen, ook als er (nog) niets speelt. */
export function isStreamArt(host: string): boolean {
  return /(^|\.)(nflxso|nflximg)\.net$/.test(host);
}

export function isMedia(host: string): boolean {
  return MEDIA.some((re) => re.test(host));
}

/**
 * Telt dit verzoek als "er speelt beeld/geluid"? Normaal alleen als het niet geblokkeerd is. Afspeelsignalen (Conviva: de speler
 * meldt elke ~minuut dat er nog afgespeeld wordt) tellen ook als NextDNS ze blokkeert: de poging zelf bewijst dat er gekeken wordt.
 */
export function isPlaying(host: string, blocked: boolean): boolean {
  return isMedia(host) && (!blocked || /(^|\.)conviva\.com$/.test(host));
}

/**
 * Adressen die een app alleen gebruikt om de verbinding open te houden (bijvoorbeeld de pushverbinding van de eufy-camera-app).
 * Die zeggen niets over gebruik en tellen daarom niet als bezoek of sessie.
 */
const QUIET = [/(^|\.)app-push-[a-z0-9-]*\.eufy\.com$/, /^megaeufy-[a-z0-9-]*\.[a-z0-9-]+\.elb\.amazonaws\.com$/, /^beacon\.shazam\.com$/];
export function isQuietHost(host: string): boolean {
  return QUIET.some((re) => re.test(host));
}
