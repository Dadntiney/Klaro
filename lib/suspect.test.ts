import { test } from "node:test";
import assert from "node:assert/strict";
import { suspicion } from "./suspect.ts";

test("nepsites en verdachte adressen", () => {
  for (const h of ["paypa1.com", "faceb00k.com", "rabobank-inloggen-veilig.xyz", "paypal-secure-login.top", "netfIix.com", "xn--pypal-4ve.com", "robux-gratis-claim.click", "qzxkvbnrtplm.top"]) assert.ok(suspicion(h), h);
  for (const h of ["paypal.com", "www.rabobank.nl", "facebook.com", "amazon.nl", "marktplaats.nl", "lego.com", "bol.com", "nu.nl", "intertoys.nl", "efteling.com", "roblox.com", "minecraft.net", "coolblue.nl", "vinted.nl", "google.nl"]) assert.equal(suspicion(h), null, h);
});
