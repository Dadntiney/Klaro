/** Systeem- en infrastructuurdomeinen: nooit als losse app tonen, ook niet bij een grote sessie. (Apart bestand: wordt ook in de browser gebruikt.) */
const SYSTEM_BASES = new Set([
  "apple.com", "aaplimg.com", "icloud.com", "icloud-content.com", "me.com", "mzstatic.com", "cdn-apple.com", "apple-dns.net", "akadns.net",
  "microsoft.com", "microsoftonline.com", "azure.com", "windows.net", "outlook.com", "office.com", "live.com", "skype.com",
  "google.com", "googleapis.com", "gstatic.com", "googleusercontent.com", "conviva.com", "akamaiedge.net", "akamai.net", "cloudfront.net", "amazonaws.com", "fastly.net", "cloudflare.com", "cloudflare.net",
]);
const BIG = /^(google|apple|icloud|microsoft|amazon|facebook|instagram|whatsapp|bing|yahoo)\.[a-z.]+$/;

export function isSystemSite(site: string): boolean {
  return SYSTEM_BASES.has(site) || BIG.test(site);
}

/** Nette weergavenaam voor een paar grote diensten die als site (niet als app) binnenkomen. */
export const NICE_NAME: Record<string, string> = { "google.com": "Google", "amazon.com": "Amazon" };

/** Gewone site (geen herkende app met een eigen naam, zoals Facebook of Netflix)? */
export function isPlainSite(g: { site: string; name: string }): boolean {
  return g.name === g.site || g.name === NICE_NAME[g.site];
}
