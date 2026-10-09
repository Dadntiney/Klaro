import { baseDomain } from "./parse.ts";
import { inAdultList, inDatingList } from "./adultlist.ts";

/** Bekende apps/diensten: meerdere domeinen samengevoegd onder één naam. `icon` is het domein voor het favicon. */
const APPS: { name: string; icon: string; domains: string[] }[] = [
  { name: "YouTube", icon: "youtube.com", domains: ["youtube.com", "youtu.be", "ytimg.com", "googlevideo.com", "youtubekids.com", "youtube-nocookie.com"] },
  { name: "Netflix", icon: "netflix.com", domains: ["netflix.com", "nflxvideo.net", "nflximg.net", "nflxext.com", "nflxso.net"] },
  { name: "Roblox", icon: "roblox.com", domains: ["roblox.com", "rbxcdn.com", "robloxlabs.com"] },
  { name: "Spotify", icon: "spotify.com", domains: ["spotify.com", "scdn.co", "spotifycdn.com"] },
  { name: "TikTok", icon: "tiktok.com", domains: ["tiktok.com", "tiktokcdn.com", "tiktokv.com", "tiktokcdn-eu.com", "musical.ly", "byteoversea.com", "ibytedtos.com", "ibyteimg.com"] },
  { name: "Instagram", icon: "instagram.com", domains: ["instagram.com", "cdninstagram.com"] },
  { name: "Facebook", icon: "facebook.com", domains: ["facebook.com", "fbcdn.net", "facebook.net", "fb.com"] },
  { name: "WhatsApp", icon: "whatsapp.com", domains: ["whatsapp.com", "whatsapp.net"] },
  { name: "Snapchat", icon: "snapchat.com", domains: ["snapchat.com", "sc-cdn.net", "snap-dev.net"] },
  { name: "Discord", icon: "discord.com", domains: ["discord.com", "discordapp.com", "discordapp.net", "discord.gg", "discord.media"] },
  { name: "Twitch", icon: "twitch.tv", domains: ["twitch.tv", "ttvnw.net", "jtvnw.net", "twitchcdn.net"] },
  { name: "Minecraft", icon: "minecraft.net", domains: ["minecraft.net", "mojang.com", "minecraftservices.com"] },
  { name: "Epic Games / Fortnite", icon: "epicgames.com", domains: ["epicgames.com", "fortnite.com", "unrealengine.com", "epicgames.dev"] },
  { name: "Steam", icon: "steampowered.com", domains: ["steampowered.com", "steamcontent.com", "steamstatic.com", "steamcommunity.com", "steamserver.net"] },
  { name: "Disney+", icon: "disneyplus.com", domains: ["disneyplus.com", "disney-plus.net", "bamgrid.com", "dssott.com"] },
  { name: "Vinted", icon: "vinted.com", domains: ["vinted.com", "vinted.nl", "vinted.be", "vinted.de", "vinted.fr", "vinted.co.uk", "vintedapp.com", "vinted.net"] },
  { name: "Nintendo", icon: "nintendo.com", domains: ["nintendo.com", "nintendo.net"] },
  { name: "PlayStation", icon: "playstation.com", domains: ["playstation.com", "playstation.net", "sonyentertainmentnetwork.com"] },
  { name: "Xbox", icon: "xbox.com", domains: ["xbox.com", "xboxlive.com"] },
];

const APP_BY_DOMAIN = new Map<string, (typeof APPS)[number]>();
for (const a of APPS) for (const d of a.domains) APP_BY_DOMAIN.set(d, a);

/** Infrastructuur, advertenties, telemetrie: verkeer van het apparaat zelf, geen bewust bezoek. */
const BACKGROUND = new Set([
  "gstatic.com", "googleapis.com", "googleusercontent.com", "google-analytics.com", "googletagmanager.com",
  "googletagservices.com", "doubleclick.net", "googlesyndication.com", "googleadservices.com", "gvt1.com", "gvt2.com",
  "app-measurement.com", "crashlytics.com", "firebaseio.com", "firebaseinstallations.googleapis.com",
  "akamaihd.net", "akamaiedge.net", "akamai.net", "edgekey.net", "edgesuite.net", "cloudfront.net", "fastly.net",
  "fastlylb.net", "azureedge.net", "trafficmanager.net", "amazonaws.com", "windowsupdate.com", "msftconnecttest.com",
  "msftncsi.com", "apple-dns.net", "mzstatic.com", "icloud-content.com", "sentry.io", "appsflyer.com", "adjust.com",
  "branch.io", "scorecardresearch.com", "cloudflare-dns.com", "nextdns.io", "ntp.org", "arpa", "local", "lan",
  "microsoft.com", "windows.com", "live.com", "office.com", "office365.com", "skype.com",
]);
/** Trefwoorden in het adres die duiden op statistieken, advertenties, foutrapportage of hulpdiensten van apps. */
const BACKGROUND_KEYWORDS = [
  "analytics", "telemetry", "tracking", "tracker", "metrics", "adservice", "adsystem", "adserver", "adnxs", "pixel", "beacon",
  "statistic", "crash", "bugsnag", "sentry", "appsflyer", "amplitude", "mixpanel", "braze", "onesignal", "firebase", "newrelic",
  "datadog", "hotjar", "optimizely", "criteo", "taboola", "outbrain", "rubiconproject", "pubmatic", "openx", "moatads", "2mdn",
  "quantserve", "demdex", "omtrdc", "adobedtm", "consent", "cookie", "akadns", "cloudfront", "cdn", "static", "assets",
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

const BACKGROUND_SUFFIX = ["push.apple.com", "ls.apple.com", "gateway.icloud.com", "play.googleapis.com", "mtalk.google.com", "connectivitycheck.gstatic.com"];
const BACKGROUND_LABELS = new Set(["telemetry", "metrics", "analytics", "ocsp", "crl", "time", "ntp", "captive", "settings-win", "update", "updates", "stats", "tracking", "events", "log", "logs", "beacon", "adservice", "ads"]);

/** 18+: pornografie en erotische webshops. Bewust voorzichtig: lange, ondubbelzinnige namen als deel van het domein, korte woorden alleen als los woord. */
const ADULT_PARTS = [
  "porn", "xxx", "hentai", "nsfw", "onlyfans", "chaturbate", "xvideos", "xnxx", "xhamster", "redtube", "youporn",
  "stripchat", "bongacams", "livejasmin", "brazzers", "rule34", "camsoda", "fansly", "spankbang", "eporner",
  "nhentai", "literotica", "sexcam", "sexchat", "sexdate", "sexfilm", "playboy",
  // erotische webshops
  "sexshop", "sex-shop", "eroshop", "eroticashop", "erotiekshop", "erotiek", "dildo", "vibrator", "bdsm", "fetish",
  "lovehoney", "amorelie", "beate-uhse", "beateuhse", "adameve", "satisfyer", "womanizer", "christineleduc",
  // overig
  "pussy", "fuck", "slut", "xvideo", "sexvid", "pornhub", "hotwife", "bukkake", "camwhore", "cumshot", "gangbang", "blowjob",
  "sextoy", "lovetoy", "adulttoy", "sexspeeltje", "sexspeeltjes", "easytoys", "sexcontact", "sexafspraak", "sexdating", "livecams", "freecams", "erocams", "adultcams", "nudecams", "sexgames", "hotcams",
];
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
]);

const ADULT_WORDS = new Set(["vagina", "penis", "sex", "sexy", "sexo", "sexe", "erotic", "erotica", "erotiek", "escort", "escorts", "camgirl", "camgirls", "nude", "nudes", "milf", "xvids", "tube8", "hentai", "lust", "naughty", "kinky"]);
const ADULT_TLDS = new Set(["xxx", "adult", "sex", "porn", "sexy"]);

/** Datingsites en -apps. Ambiguë namen alleen als exact basisdomein. */
const DATING_PARTS = [
  "dating", "tinder", "badoo", "grindr", "okcupid", "parship", "eharmony", "meetic", "zoosk", "happn", "ashleymadison",
  "adultfriendfinder", "benaughty", "relatieplanet", "flirt", "victoriamilan", "elitesingles", "silversingles", "christianmingle",
  "jdate", "ourtime", "seniorpeoplemeet", "plentyoffish", "datemyage", "c-date", "lovescout", "elitepartner", "friendscout",
  "singleboerse", "gaydar", "growlr", "scruff", "jackd", "taimi", "meetme", "mocospace", "datingjungle", "flirtfair",
  "omegle", "chatroulette", "emeraldchat", "monkey.app", "singles", "hookup", "lovoo", "jaumo", "mamba.ru", "loveawake",
];
/** Exacte sites; voor namen die als woord te algemeen zijn. */
const DATING_DOMAINS = new Set([
  "bumble.com", "hinge.co", "match.com", "pof.com", "feeld.co", "raya.app", "lexa.nl", "seeking.com", "coffeemeetsbagel.com",
  "boo.world", "mingle2.com", "fruitz.io", "inner-circle.com", "theinnercircle.co", "twoo.com", "skout.com", "jaumo.com",
  "hily.com", "tantan.com", "her.app", "wapa.app", "hornet.com", "thursday.app", "chemistry.com", "ome.tv", "azar.live",
  "yubo.live", "tagged.com", "datingapp.nl", "lovestruck.com", "bumbleapp.com", "gotinder.com", "tinderchallenge.com",
  "sugardaddy.com", "seekingarrangement.com", "whatsyourprice.com", "luxy.com", "thecoffeemeetsbagel.com", "clover.co",
  "pairs.lv", "omiai-jp.com", "tapple.me", "paktor.com", "hello.talk", "mamba.ru", "badoo.com", "lovoo.com",
]);

export function isDating(host: string): boolean {
  return DATING_DOMAINS.has(baseDomain(host)) || DATING_PARTS.some((p) => host.includes(p)) || inDatingList(host);
}

export function isAdult(host: string): boolean {
  const labels = host.split(".");
  if (ADULT_TLDS.has(labels[labels.length - 1])) return true;
  if (inAdultList(host) || SEXSHOP_DOMAINS.has(baseDomain(host))) return true;
  if (ADULT_PARTS.some((p) => host.includes(p))) return true;
  return labels.some((l) => l.split("-").some((w) => ADULT_WORDS.has(w)));
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

export function isMainHost(host: string, base: string): boolean {
  if (host === base) return !APEX_NOISE.test(base);
  if (!host.endsWith("." + base)) return false;
  const rest = host.slice(0, host.length - base.length - 1);
  if (rest === "www") return true;
  // Bij grote partijen (Apple, Google, Amazon, ...) is alleen www. een echt bezoek; de rest is systeem- of app-verkeer.
  if (APEX_NOISE.test(base)) return false;
  return LANG.has(rest) || ["m", "web", "app", "mobile"].includes(rest);
}

/** VPN's, proxy's, Tor en DNS-diensten waarmee het filter van NextDNS kan worden omzeild. */
const VPN_DOMAINS = new Set([
  "nordvpn.com", "nordcdn.com", "nordaccount.com", "expressvpn.com", "protonvpn.com", "surfshark.com", "privateinternetaccess.com", "cyberghostvpn.com",
  "tunnelbear.com", "windscribe.com", "mullvad.net", "hide.me", "hotspotshield.com", "ipvanish.com", "torguard.net", "vyprvpn.com", "atlasvpn.com", "hola.org",
  "psiphon.ca", "getlantern.org", "lantern.io", "torproject.org", "ultrasurf.us", "vpnunlimited.com", "keepsolid.com", "betternet.co", "turbovpn.com", "vpnbook.com",
  "proxysite.com", "hidemyass.com", "hma.com", "croxyproxy.com", "kproxy.com", "hidester.com", "vpn.net", "zenmate.com", "purevpn.com", "ivacy.com", "x-vpn.com",
  "cloudflareclient.com", "warp.plus", "speedify.com", "urban-vpn.com", "ghostery.com", "opera-proxy.net", "browsec.com", "veepn.com", "planetvpn.com", "snapvpn.com",
  // DNS-over-HTTPS / eigen DNS-diensten: wie die gebruikt, omzeilt NextDNS
  "dns.google", "dns.quad9.net", "doh.opendns.com", "cloudflare-dns.com", "dns.adguard.com", "dns.adguard-dns.com", "dnsforge.de", "doh.dns.sb", "mullvad-dns.net",
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
const NEVER_FLAG = new Set(["list-manage.com", "mailchimp.com", "mcusercontent.com", "sendgrid.net", "mandrillapp.com", "google.com", "youtube.com", "facebook.com", "instagram.com", "microsoft.com", "apple.com", "amazon.com", "wikipedia.org", "reddit.com", "twitter.com", "x.com"]);

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
function canonSite(base: string): string {
  if (/^google\.[a-z.]+$/.test(base)) return "google.com";
  if (/^amazon\.[a-z.]+$/.test(base)) return "amazon.com";
  return base;
}

function classifyUncached(host: string): SiteInfo {
  const base = baseDomain(host);
  const app = APP_BY_DOMAIN.get(base);
  if (app) return { site: app.icon, name: app.name, icon: app.icon, bg: false, adult: false, main: true, flag: ALERT_APPS.has(app.name) ? app.name : undefined };
  // Eerst dating: sommige datingsites staan ook op de porno-lijst, maar het label Dating is dan duidelijker.
  // VPN/proxy en DNS-omzeiling eerst: altijd zichtbaar en rood, ook als het eigenlijk hulpverkeer is.
  if (!NEVER_FLAG.has(base) && isVpn(host)) return { site: canonSite(base), name: canonSite(base), icon: canonSite(base), bg: false, adult: false, main: true, flag: "VPN/proxy" };
  const never = NEVER_FLAG.has(base);
  const dating = !never && isDating(host);
  const adult = !never && !dating && isAdult(host);
  const label = host.split(".")[0];
  const bg =
    !adult && !dating && (BACKGROUND.has(base) ||
    BACKGROUND_SUFFIX.some((s) => host === s || host.endsWith("." + s)) ||
    (host !== base && BACKGROUND_LABELS.has(label)) ||
    BACKGROUND_KEYWORDS.some((k) => host.includes(k)) ||
    BACKGROUND.has(host.split(".").slice(-1)[0]));
  const flag = adult ? "18+" : dating ? "Dating" : undefined;
  return { site: canonSite(base), name: canonSite(base), icon: canonSite(base), bg, adult, main: !!flag || isMainHost(host, base), flag };
}
