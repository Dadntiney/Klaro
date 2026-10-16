// Maakt de map out/ klaar voor eigen hosting: de pagina's (next build) + het PHP-deel + de 18+/datinglijsten per vakje.
// Gebruik: npx next build && node scripts/build-site.mjs
import fs from "node:fs";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { buildSync } from "esbuild";

if (!fs.existsSync("out/index.html")) throw new Error("Eerst `npx next build` (map out/ ontbreekt)");
fs.cpSync("php", "out", { recursive: true });
// Het zware rekenwerk (alle dagen) draait in een aparte achtergrond-thread; next build bundelt die niet mee.
buildSync({ entryPoints: ["lib/overview.worker.ts"], bundle: true, minify: true, format: "iife", target: "es2020", outfile: "out/overview-worker.js" });
for (const name of ["adult", "dating"]) {
  const domains = zlib.gunzipSync(fs.readFileSync(`data/${name}-domains.txt.gz`)).toString("utf8").split("\n").filter(Boolean);
  const buckets = new Map();
  for (const d of domains) {
    const b = crypto.createHash("md5").update(d).digest("hex").slice(0, 2);
    (buckets.get(b) ?? buckets.set(b, []).get(b)).push(d);
  }
  const dir = `out/api/_private/lists/${name}`;
  fs.mkdirSync(dir, { recursive: true });
  for (const [b, list] of buckets) fs.writeFileSync(`${dir}/${b}.txt`, "\n" + list.join("\n") + "\n");
  console.log(`${name}: ${domains.length} adressen in ${buckets.size} vakjes`);
}
