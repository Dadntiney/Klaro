import { test } from "node:test";
import assert from "node:assert/strict";
import { netLabel } from "./netinfo-client.ts";

test("netwerk bij een regel: soort plus provider als die bekend is; zonder soort nooit raden", () => {
  assert.equal(netLabel({ soort: "mobiel", merk: "Vodafone" }), "mobiel internet · Vodafone");
  assert.equal(netLabel({ soort: "vast", merk: "Odido" }), "andere wifi · Odido");
  assert.equal(netLabel({ soort: null, merk: "KPN" }), "niet thuis · KPN");
  assert.equal(netLabel(null), "niet thuis");
});

test("tekst bij een regel: eigen naam, hotspot en buitenland", async () => {
  const { netText } = await import("./netinfo-client.ts");
  assert.equal(netText({ soort: "vast", merk: "Odido" }).text, "Odido");
  assert.equal(netText({ soort: "vast", merk: "Odido" }, { naam: "werk" }).text, "werk");
  assert.equal(netText({ soort: "mobiel", merk: "Vodafone" }, { hotspot: "iPhone" }).text, "hotspot iPhone");
  assert.equal(netText({ soort: "vast", merk: "Odido" }, { hotspot: "iPhone" }).icon, "vast"); // gedeelde wifi elders is geen hotspot
  assert.equal(netText({ soort: "vast", merk: "Telekom", land: "DE" }).text, "Telekom · Duitsland");
  assert.equal(netText({ soort: "mobiel", merk: "Vodafone", land: "NL" }).text, "Vodafone");
  assert.equal(netText(null).text, "niet thuis");
});
