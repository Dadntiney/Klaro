// Is een adres echt een website? Laat de server (pichya.nl) de voorpagina ophalen; een aanwijzing bij twijfelgevallen, geen bewijs.
// Gebruik: KLARO_PW=... node --experimental-strip-types scripts/sitecheck.ts adres1 adres2 ...
// 18+/dating haalt de server nooit op. Uitkomst wordt 30 dagen bewaard (zelfde adres = geen nieuw bezoek).
const site = process.env.KLARO_SITE ?? "https://pichya.nl";
const pw = process.env.KLARO_PW;
if (!pw) throw new Error("KLARO_PW ontbreekt");
const headers = { Authorization: "Basic " + Buffer.from("klaro:" + pw).toString("base64") };
for (const host of process.argv.slice(2)) {
  const res = await fetch(`${site}/api/sitecheck.php?host=${encodeURIComponent(host)}`, { headers, signal: AbortSignal.timeout(20_000) });
  const v = (await res.json().catch(() => ({}))) as { soort?: string; titel?: string; naar?: string; uitleg?: string; code?: number; error?: string };
  console.log([host, v.soort ?? v.error ?? res.status, v.titel ? `"${v.titel}"` : "", v.naar ? `-> ${v.naar}` : "", v.uitleg ?? ""].filter(Boolean).join("  "));
}
