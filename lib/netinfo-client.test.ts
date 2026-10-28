import { test } from "node:test";
import assert from "node:assert/strict";
import { netLabel } from "./netinfo-client.ts";

test("netwerk bij een regel: soort plus provider als die bekend is; zonder soort nooit raden", () => {
  assert.equal(netLabel({ soort: "mobiel", merk: "Vodafone" }), "mobiel · Vodafone");
  assert.equal(netLabel({ soort: "vast", merk: "Odido" }), "wifi · Odido");
  assert.equal(netLabel({ soort: null, merk: "KPN" }), "niet thuis · KPN");
  assert.equal(netLabel(null), "niet thuis");
});
