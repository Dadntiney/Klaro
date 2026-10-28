import { test } from "node:test";
import assert from "node:assert/strict";
import { netLabel } from "./netinfo-client.ts";

test("netwerk bij een regel: soort plus provider als die bekend is; zonder soort nooit raden", () => {
  assert.equal(netLabel({ soort: "mobiel", merk: "Vodafone" }), "mobiele data · Vodafone (kan ook thuis zijn, als de wifi even wegvalt)");
  assert.equal(netLabel({ soort: "vast", merk: "Odido" }), "andere wifi · Odido (een andere plek)");
  assert.equal(netLabel({ soort: null, merk: "KPN" }), "niet via de wifi thuis · KPN");
  assert.equal(netLabel(null), "niet via de wifi thuis");
});

test("tekst bij een regel: eigen naam, hotspot en buitenland", async () => {
  const { netText } = await import("./netinfo-client.ts");
  assert.equal(netText({ soort: "vast", merk: "Odido" }).text, "Odido");
  assert.equal(netText({ soort: "mobiel", merk: "Vodafone" }).text, "Mobiel"); // kort; geen "onderweg" (kan ook thuis zijn), nooit "5G" (niet te zien)
  assert.equal(netText({ soort: "mobiel", merk: "Vodafone" }).uitleg, "mobiele data · Vodafone (kan ook thuis zijn, als de wifi even wegvalt)");
  assert.equal(netText({ soort: "vast" }).text, "Andere wifi");
  assert.equal(netText({ soort: "vast", merk: "Odido" }, { naam: "werk" }).text, "werk");
  assert.equal(netText({ soort: "mobiel", merk: "Vodafone" }, { hotspot: "iPhone" }).text, "hotspot iPhone");
  assert.equal(netText({ soort: "vast", merk: "Odido" }, { hotspot: "iPhone" }).icon, "vast"); // gedeelde wifi elders is geen hotspot
  assert.equal(netText({ soort: "vast", merk: "Telekom", land: "DE" }).text, "Telekom · Duitsland");
  assert.equal(netText({ soort: "mobiel", merk: "Vodafone", land: "NL" }).text, "Mobiel");
  assert.equal(netText(null).text, "Niet via thuis-wifi");
});
