import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encrypt, keysFrom, vapidAuth } from "./webpush.ts";

test("versleuteling volgens het voorbeeld in RFC 8291 (bijlage A)", () => {
  const out = encrypt(
    "When I grow up, I want to be a watermelon",
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    "BTBZMqHH6r4Tts7J_aSIgg",
    Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url"),
    Buffer.from("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "base64url"),
  );
  assert.equal(
    out.toString("base64url"),
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  );
});

test("sleutels: altijd dezelfde uit hetzelfde geheim, andere uit een ander geheim; handtekening klopt", () => {
  const a = keysFrom("geheim-1"), b = keysFrom("geheim-1"), c = keysFrom("geheim-2");
  assert.equal(a.alertKey, b.alertKey);
  assert.ok(a.vapidPublic.equals(b.vapidPublic));
  assert.notEqual(a.alertKey, c.alertKey);
  assert.equal(a.vapidPublic.length, 65);
  assert.equal(a.alertHash, crypto.createHash("sha256").update(a.alertKey).digest("hex"));
  const h = vapidAuth("https://web.push.apple.com/abc", a, "https://pichya.nl", 1_760_000_000_000);
  const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
  assert.deepEqual(JSON.parse(Buffer.from(m[2], "base64url").toString()), { aud: "https://web.push.apple.com", exp: 1_760_000_000 + 12 * 3600, sub: "https://pichya.nl" });
  const pub = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: a.vapidPublic.subarray(1, 33).toString("base64url"), y: a.vapidPublic.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3], "base64url")));
  assert.equal(m[4], a.vapidPublic.toString("base64url"));
});
