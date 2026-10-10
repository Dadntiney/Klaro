/**
 * Inloggen met een cookie: één keer het wachtwoord invullen, daarna blijft het apparaat 180 dagen ingelogd.
 * De cookie bevat geen wachtwoord, alleen een handtekening die ervan is afgeleid: wordt APP_PASSWORD in Vercel veranderd,
 * dan zijn alle apparaten meteen uitgelogd. Werkt zowel in de middleware (Edge) als in een route (Node).
 */
export const AUTH_COOKIE = "klaro_auth";
export const AUTH_DAYS = 180;

export async function authToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("klaro-login-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Vergelijk zonder vroegtijdig te stoppen (geen hint via de tijd die het kost). */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
