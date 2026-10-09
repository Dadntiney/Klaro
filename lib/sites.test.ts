import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, payKind, isMedia } from "./sites.ts";

test("apps worden samengevoegd", () => {
  assert.equal(classify("i.ytimg.com").name, "YouTube");
  assert.equal(classify("rr3---sn.googlevideo.com").site, "youtube.com");
  assert.equal(classify("www.roblox.com").name, "Roblox");
});

test("achtergrondverkeer", () => {
  assert.equal(classify("www.gstatic.com").bg, true);
  assert.equal(classify("telemetry.example.com").bg, true);
  assert.equal(classify("1.0.0.10.in-addr.arpa").bg, true);
  assert.equal(classify("www.nu.nl").bg, false);
  assert.equal(classify("www.lego.com").bg, false);
});

test("18+ herkenning", () => {
  for (const h of ["www.pornhub.com", "nl.xvideos.com", "example.xxx", "sex-shop.nl", "www.lovehoney.nl", "dildo-shop.nl", "eroticashop.nl"]) assert.equal(classify(h).adult, true, h);
  for (const h of ["www.sussex.ac.uk", "www.essex.com", "abc.alphabet.com", "www.lego.com", "www.nu.nl", "betterhelp.com", "www.unibet.nl", "casino-online.nl", "www.holland-casino.nl", "www.betcity.nl"]) assert.equal(classify(h).adult, false, h);
});

test("WhatsApp is niet rood", () => {
  assert.equal(classify("mmg.whatsapp.net").flag, undefined);
  assert.equal(classify("mmg.whatsapp.net").name, "WhatsApp");
  assert.equal(classify("pornhub.com").flag, "18+");
  assert.equal(classify("www.lego.com").flag, undefined);
});

test("dating", () => {
  for (const h of ["www.tinder.com", "bumble.com", "nl.badoo.com", "www.datingsite.nl", "lexa.nl", "www.parship.nl"]) assert.equal(classify(h).flag, "Dating", h);
  for (const h of ["www.bumblebee.nl", "www.lego.com", "www.update.nl"]) assert.equal(classify(h).flag, undefined, h);
});

test("hoofdadressen", () => {
  for (const h of ["www.nu.nl", "nu.nl", "nl.wikipedia.org", "m.facebook.com", "www.lego.com"]) assert.equal(classify(h).main, true, h);
  for (const h of ["cdn.nu.nl", "api.lego.com", "static.example.com", "img-1.shop.nl", "tracking.example.org"]) assert.equal(classify(h).main, false, h);
  assert.equal(classify("rr3---sn.googlevideo.com").main, true); // bekende app
  assert.equal(classify("cdn.pornhub.com").main, true); // 18+ nooit verbergen
});

test("app-verkeer verborgen, echte sites blijven", () => {
  for (const h of ["app-analytics-services.com", "bugsnag.com", "media-amazon.com", "ssl-images-amazon.com", "static.adnetwork.io"]) assert.equal(classify(h).bg, true, h);
  for (const h of ["google.com", "apple.com", "amazon.nl"]) assert.equal(classify(h).main, false, h);
  for (const h of ["www.google.com", "www.amazon.nl", "www.bol.com", "bol.com", "github.com"]) assert.equal(classify(h).main && !classify(h).bg, true, h);
});

test("grote porno-lijst", () => {
  for (const h of ["lesbianaselsalvador.com", "www.0-0-adult-superstore.com", "cdn.0-0-adult-superstore.com"]) assert.equal(classify(h).flag, "18+", h);
  for (const h of ["www.google.com", "www.youtube.com", "www.reddit.com", "twitter.com", "www.facebook.com", "nl.wikipedia.org", "www.bol.com", "www.nu.nl", "tumblr.com", "www.nakedwines.com"]) assert.equal(classify(h).flag, undefined, h);
});

test("voorbeelden van de eigenaar", () => {
  for (const h of ["vagina.nl", "pornhub.com", "phncdn.com", "phprcdn.com", "easytoys.nl", "www.badoo.com", "lovehoney.nl", "www.amorelie.nl"]) assert.ok(classify(h).flag, h);
});

test("gevonden valse alarmen en trackers", () => {
  assert.equal(classify("list-manage.com").flag, undefined);
  for (const h of ["adsrvr.org", "clarity.ms", "sendgrid.net", "recaptcha.net", "unpkg.com", "usercentrics.eu", "plausible.io", "statcounter.com"]) assert.equal(classify(h).bg, true, h);
  for (const h of ["www.bol.com", "www.intertoys.nl", "www.efteling.com", "www.rabobank.nl", "www.nu.nl", "www.kruidvat.nl"]) assert.equal(classify(h).bg || !!classify(h).flag, false, h);
});

test("systeemadressen van grote partijen zijn geen bezoek", () => {
  for (const h of ["gs.apple.com", "xp.apple.com", "pd.apple.com", "mt.apple.com", "ca.google.com", "ad.amazon.nl"]) assert.equal(classify(h).main, false, h);
  for (const h of ["www.apple.com", "www.google.nl", "nl.wikipedia.org", "de.wikipedia.org", "m.facebook.com"]) assert.equal(classify(h).main, true, h);
});

test("VPN, proxy en DNS-omzeiling", () => {
  for (const h of ["www.nordvpn.com", "api.protonvpn.com", "dns.google", "mozilla.cloudflare-dns.com", "my-vpn-service.com", "www.torproject.org"]) assert.equal(classify(h).flag, "VPN/proxy", h);
  for (const h of ["www.nu.nl", "www.google.com", "www.icloud.com", "www.lego.com"]) assert.notEqual(classify(h).flag, "VPN/proxy", h);
});

test("Apple-systeemadressen zijn geen VPN", () => {
  for (const h of ["mask.icloud.com", "mask-h2.icloud.com", "www.icloud.com", "gateway.icloud.com", "mask.apple-dns.net", "apple-dns.net"]) assert.notEqual(classify(h).flag, "VPN/proxy", h);
});

test("landvarianten en apps worden één regel", () => {
  assert.equal(classify("www.google.nl").site, "google.com");
  assert.equal(classify("www.google.be").site, "google.com");
  assert.equal(classify("www.amazon.nl").site, "amazon.com");
  assert.equal(classify("api.vintedapp.com").name, "Vinted");
  assert.equal(classify("www.vinted.nl").name, "Vinted");
});

test("betaalmomenten en mediaverkeer", () => {
  assert.equal(payKind("pay.ideal.nl")?.level, "checkout");
  assert.equal(payKind("checkout.pay.nl")?.kind, "Afrekenpagina");
  assert.equal(payKind("p73-buy.itunes.apple.com")?.level, "store");
  assert.equal(payKind("mzstorekit.itunes.apple.com"), null);
  assert.equal(payKind("js.stripe.com"), null);
  assert.equal(isMedia("ipv6-c237-ams001-ix.1.oca.nflxvideo.net"), true);
  assert.equal(isMedia("rr3---sn-5hne6nsd.googlevideo.com"), true);
  assert.equal(isMedia("vod-akc-eu-west-1.media.dssott.com"), true);
  assert.equal(isMedia("scontent-ams2-1.cdninstagram.com"), true);
  assert.equal(isMedia("scontent.xx.fbcdn.net"), true);
  assert.equal(isMedia("graph.facebook.com"), false);
});

test("portaaladressen tellen als bezoek, hulpadressen niet", () => {
  for (const h of ["mijn.postnl.nl", "shop.lego.com", "mail.provider.nl", "chat.openai.com"]) assert.equal(classify(h).main, true, h);
  for (const h of ["image.edm.postnl.nl", "click.edm.postnl.nl", "c.media-amazon.com", "tracking.postnl.nl"]) assert.equal(classify(h).main && !classify(h).bg, false, h);
});
