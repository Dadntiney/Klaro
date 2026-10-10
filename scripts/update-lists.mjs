// Werkt de 18+- en datinglijsten in data/ bij met de nieuwste versies van de bronlijsten.
// Alleen toevoegen, nooit weghalen: een domein dat ooit op een lijst stond, blijft herkend.
// Gebruik: node scripts/update-lists.mjs   (draait wekelijks via .github/workflows/update-lists.yml)
import fs from "node:fs";
import zlib from "node:zlib";

const ADULT = [
  "https://raw.githubusercontent.com/blocklistproject/Lists/master/alt-version/porn-nl.txt",
  "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/nsfw-onlydomains.txt",
  "https://raw.githubusercontent.com/Sinfonietta/hostfiles/master/pornography-hosts",
  "https://raw.githubusercontent.com/StevenBlack/hosts/master/extensions/porn/clefspeare13/hosts",
];
const DATING = ["https://raw.githubusercontent.com/olbat/ut1-blacklists/master/blacklists/dating/domains"];

// Grote platforms en infrastructuur: nooit als 18+ of dating markeren, ook als een lijst ze (ten onrechte) bevat.
const NEVER = new Set([
  "google.com", "youtube.com", "facebook.com", "instagram.com", "apple.com", "icloud.com", "amazon.com", "microsoft.com", "twitter.com", "x.com",
  "reddit.com", "tiktok.com", "snapchat.com", "whatsapp.com", "whatsapp.net", "cloudfront.net", "akamaized.net", "amazonaws.com", "googleapis.com",
  "fastly.net", "cloudflare.com", "imgur.com", "tumblr.com", "discord.com", "telegram.org", "t.me", "pinterest.com", "wikipedia.org", "vercel.app",
  "github.io", "blogspot.com", "wordpress.com", "itch.io", "netflix.com", "spotify.com", "bol.com", "nu.nl", "nos.nl",
]);

function parse(text) {
  const out = new Set();
  for (let l of text.split("\n")) {
    l = l.trim().toLowerCase();
    if (!l || l[0] === "#" || l[0] === "!") continue;
    const p = l.split(/\s+/);
    let h = (p[0] === "0.0.0.0" || p[0] === "127.0.0.1") && p[1] ? p[1] : p[0];
    h = h.replace(/^\|\|/, "").replace(/\^.*$/, "").replace(/^\*\./, "").replace(/^\./, "");
    if (h.includes(".") && /^[a-z0-9.-]+$/.test(h) && h !== "localhost" && !h.endsWith(".")) out.add(h);
  }
  return out;
}

/** Kortste vorm: een subdomein weg als het ouderdomein er al op staat. */
function minimal(set) {
  const out = new Set();
  for (const h of [...set].sort((a, b) => a.split(".").length - b.split(".").length)) {
    const parts = h.split(".");
    let covered = false;
    for (let i = 1; i < parts.length - 1; i++) if (out.has(parts.slice(i).join("."))) { covered = true; break; }
    if (!covered) out.add(h);
  }
  return out;
}

async function update(file, urls, minSize) {
  const old = new Set(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8").split("\n").filter(Boolean));
  const all = new Set(old);
  for (const u of urls) {
    const res = await fetch(u);
    if (!res.ok) throw new Error(`${u}: ${res.status}`);
    const got = parse(await res.text());
    if (got.size < minSize) throw new Error(`${u}: verdacht klein (${got.size})`);
    for (const h of got) all.add(h);
    console.log(`${u}: ${got.size}`);
  }
  for (const n of NEVER) all.delete(n);
  const next = minimal(all);
  const added = [...next].filter((h) => !old.has(h)).length;
  console.log(`${file}: was ${old.size}, nu ${next.size} (+${added})`);
  if (added) fs.writeFileSync(file, zlib.gzipSync([...next].sort().join("\n") + "\n", { level: 9 }));
}

await update("data/adult-domains.txt.gz", ADULT, 1000);
await update("data/dating-domains.txt.gz", DATING, 1000);
