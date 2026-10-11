/**
 * Een YouTube-sessie met alleen videoservers (googlevideo) en niets van de YouTube-app of -site zelf (ytimg, youtube.com):
 * een clip die in een andere app speelt, zoals Shazam bij een herkend nummer. Alleen als het kort is (< 5 min) en niet vlak
 * na echt YouTube-gebruik: dan heeft de app plaatjes en gegevens al en vraagt hij tijdens het kijken alleen nog video op.
 */
export function isVideoOnlyClip(hosts: string[], durMs: number, recentYouTube: boolean): boolean {
  return hosts.length > 0 && hosts.every((h) => /(^|\.)googlevideo\.com$/.test(h)) && durMs < 300_000 && !recentYouTube;
}

/** Adressen die alleen de YouTube-app of -site zelf opvraagt (niet een speler in een andere app): API en kanaalplaatjes. */
export function isYouTubeAppHost(host: string): boolean {
  return /^(youtubei|youtube)\.googleapis\.com$|^yt\d\.(ggpht|googleusercontent)\.com$/.test(host);
}
