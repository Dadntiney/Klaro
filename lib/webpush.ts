/**
 * Pushmeldingen versturen zonder extra pakketten (Node): VAPID-ondertekening (RFC 8292) en versleuteling aes128gcm (RFC 8291).
 * De sleutels worden afgeleid van een geheim (zie `keysFrom`), zodat de server (openbare sleutel, hash van de taaksleutel) en de
 * waarschuw-taak op GitHub (alles) dezelfde hebben zonder dat iemand iets hoeft in te stellen.
 */
import crypto from "node:crypto";

const b64u = (b: Buffer) => b.toString("base64url");
const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

export type Keys = { alertKey: string; alertHash: string; vapidPrivate: Buffer; vapidPublic: Buffer };

/** Alle sleutels uit één geheim: dezelfde invoer geeft altijd dezelfde sleutels. */
export function keysFrom(secret: string): Keys {
  const h = (label: string) => crypto.createHmac("sha256", secret).update(label).digest();
  const alertKey = h("klaro-alert-v1").toString("hex");
  // Geldige P-256-privésleutel: 1 <= d < n (een HMAC-uitkomst is dat vrijwel altijd; anders opnieuw met een teller).
  let d = h("klaro-vapid-v1");
  for (let i = 0; BigInt("0x" + d.toString("hex")) === 0n || BigInt("0x" + d.toString("hex")) >= P256_N; i++) d = h(`klaro-vapid-v1-${i}`);
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  return { alertKey, alertHash: crypto.createHash("sha256").update(alertKey).digest("hex"), vapidPrivate: d, vapidPublic: ecdh.getPublicKey() };
}

function vapidKeyObject(k: Keys): crypto.KeyObject {
  const pub = k.vapidPublic;
  return crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(k.vapidPrivate), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
}

/** Authorization-kop voor de push-dienst van dit abonnement (geldig 12 uur). */
export function vapidAuth(endpoint: string, k: Keys, subject = "https://pichya.nl", now = Date.now()): string {
  const aud = new URL(endpoint).origin;
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: vapidKeyObject(k), dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${b64u(k.vapidPublic)}`;
}

const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));

/** Versleutel een bericht voor één abonnement (aes128gcm, één blok). `salt` en `localPrivate` alleen vast in tests. */
export function encrypt(payload: string, p256dh: string, auth: string, salt = crypto.randomBytes(16), localPrivate?: Buffer): Buffer {
  const uaPub = Buffer.from(p256dh, "base64url");
  const authSecret = Buffer.from(auth, "base64url");
  const local = crypto.createECDH("prime256v1");
  if (localPrivate) local.setPrivateKey(localPrivate);
  else local.generateKeys();
  const asPub = local.getPublicKey();
  const shared = local.computeSecret(uaPub);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);
  head.writeUInt8(asPub.length, 20);
  return Buffer.concat([head, asPub, body]);
}

export type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Verstuur één melding. Geeft de HTTP-status van de push-dienst (201 = gelukt, 404/410 = abonnement bestaat niet meer). */
export async function sendPush(sub: Sub, message: { title: string; body: string; tag?: string }, k: Keys): Promise<number> {
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: vapidAuth(sub.endpoint, k), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "3600", Urgency: "high" },
    body: new Uint8Array(encrypt(JSON.stringify(message), sub.keys.p256dh, sub.keys.auth)),
  });
  return res.status;
}
