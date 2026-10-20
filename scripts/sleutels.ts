// Bij het live zetten: de openbare push-sleutel en de hash van de taaksleutel voor de server, afgeleid van het deploy-geheim
// (zie lib/webpush.ts). De geheime delen blijven bij GitHub; op de server staat niets waarmee je kunt waarschuwen of inloggen.
// Gebruik: KLARO_GEHEIM=... node --experimental-strip-types scripts/sleutels.ts out/api/_private
import fs from "node:fs";
import { keysFrom } from "../lib/webpush.ts";

const secret = process.env.KLARO_GEHEIM ?? "";
const dir = process.argv[2] ?? "out/api/_private";
if (!secret) throw new Error("KLARO_GEHEIM ontbreekt");
const k = keysFrom(secret);
fs.writeFileSync(`${dir}/alert.key`, k.alertHash + "\n");
fs.writeFileSync(`${dir}/vapid.pub`, k.vapidPublic.toString("base64url") + "\n");
console.log("Sleutels voor waarschuwen klaargezet.");
