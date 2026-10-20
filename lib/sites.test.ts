import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, isLoginHost, fgHit, isEmbedHost, payKind, isMedia, isMainHost, isNeverFlag } from "./sites.ts";

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
  // Second Love (vreemdgaan): ook de Belgische en andere versies, niet alleen secondlove.nl van de 18+-lijst (eigenaar, 20 okt)
  for (const h of ["www.secondlove.nl", "www.secondlove.be", "secondlove.com", "api.secondlove.de"]) assert.ok(classify(h).flag, h);
  for (const h of ["www.second-hand.nl", "www.lovespace.nl", "www.secondopinion.nl"]) assert.equal(classify(h).flag, undefined, h);
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
  for (const h of ["gs.apple.com", "xp.apple.com", "pd.apple.com", "mt.apple.com", "ca.google.com", "ad.amazon.nl", "www.apple.com"]) assert.equal(classify(h).main, false, h);
  for (const h of ["www.google.nl", "nl.wikipedia.org", "de.wikipedia.org", "m.facebook.com"]) assert.equal(classify(h).main, true, h);
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
  for (const h of ["mijn.postnl.nl", "shop.lego.com", "webmail.provider.nl", "chat.openai.com"]) assert.equal(classify(h).main, true, h);
  for (const h of ["image.edm.postnl.nl", "click.edm.postnl.nl", "c.media-amazon.com", "tracking.postnl.nl"]) assert.equal(classify(h).main && !classify(h).bg, false, h);
});

test("inlogdiensten zijn geen bezoek", () => {
  for (const h of ["login.microsoftonline.com", "login.live.com", "shed.outlook.acdc.tm.svc.cloud.microsoft", "x.okta.com"]) assert.equal(classify(h).bg, true, h);
  assert.equal(classify("www.parnassys.net").main && !classify("www.parnassys.net").bg, true);
});

test("nieuwsbrief-adres mail.merk.com is geen bezoek", () => {
  assert.equal(isMainHost("mail.efteling.com", "efteling.com"), false);
  assert.equal(isMainHost("www.efteling.com", "efteling.com"), true);
});

test("slimme apparaten en widgets zijn geen bezoek", () => {
  for (const h of ["dpgmedia.net", "js.stripe.network", "x.omnidesk.io"]) assert.equal(classify(h).bg, true, h);
  for (const h of ["eufy.com", "meethue.com", "www.efteling.com", "www.kruidvat.nl", "www.lidl.nl", "www.vinted.com"]) assert.equal(!classify(h).bg && classify(h).main, true, h);
});

test("www.apple.com is systeemverkeer; Budge Studios is een app", () => {
  assert.equal(!classify("www.apple.com").bg && classify("www.apple.com").main, false);
  const b = classify("configs.budgestudios.ca");
  assert.equal(!b.bg && b.main, true);
  assert.equal(b.name, "Budge Studios (spel)");
});

test("gofiev.vercel.app wordt GoFiev.nl", () => {
  for (const h of ["gofiev.vercel.app", "www.gofiev.nl", "gofiev.nl"]) {
    const c = classify(h);
    assert.equal(c.name, "GoFiev.nl", h);
    assert.equal(!c.bg && c.main, true, h);
  }
  assert.notEqual(classify("andere.vercel.app").name, "GoFiev.nl");
});

test("bekende spellen worden als app getoond", () => {
  const cases: [string, string][] = [["api.tocaboca.com", "Toca Boca (spel)"], ["www.squla.nl", "Squla (leren)"], ["gateway.king.com", "Candy Crush (spel)"], ["cdp.cloud.unity3d.com", "Spel (naam onbekend)"], ["config.applovin.com", "Spel (naam onbekend)"]];
  for (const [h, n] of cases) {
    const c = classify(h);
    assert.equal(c.name, n, h);
    assert.equal(!c.bg && c.main, true, h);
  }
});

test("tv-apps (Ziggo GO e.d.) zijn een bezoek; conviva telt als beeldverkeer", () => {
  const z = classify("spark-prod-nl.gnp.cloud.ziggogo.tv");
  assert.equal(z.name, "Ziggo GO");
  assert.equal(!z.bg && z.main, true);
  assert.equal(classify("www.npostart.nl").name, "NPO");
  assert.equal(isMedia("cws-lgi.conviva.com"), true);
  assert.equal(isMedia("graph.facebook.com"), false);
});

test("Philips Hue (api.meethue.com) is een app", () => {
  for (const h of ["api.meethue.com", "api.account.meethue.com", "auth.meethue.com"]) {
    const c = classify(h);
    assert.equal(c.name, "Philips Hue", h);
    assert.equal(!c.bg && c.main, true, h);
  }
});

test("verbinding openhouden (eufy push) telt niet als bezoek", async () => {
  const { isQuietHost } = await import("./sites.ts");
  assert.equal(isQuietHost("app-push-eu-pr.eufy.com"), true);
  assert.equal(isQuietHost("megaeufy-fra-pr-871949979.eu-central-1.elb.amazonaws.com"), true);
  assert.equal(isQuietHost("app-openapi-eu-pr.eufy.com"), false);
  assert.equal(isQuietHost("app-devicemanage-eu-pr.eufy.com"), false);
});

test("Shazam is een app; de achtergrondmelding (beacon) telt niet", async () => {
  const { isQuietHost } = await import("./sites.ts");
  for (const h of ["config.shazam.com", "amp.shazam.com", "cdn.shazam.com"]) {
    assert.equal(classify(h).name, "Shazam", h);
    assert.equal(!classify(h).bg && classify(h).main, true, h);
    assert.equal(isQuietHost(h), false, h);
  }
  assert.equal(isQuietHost("beacon.shazam.com"), true);
  assert.equal(classify("beacon.shazam.com").bg, true);
});

test("Buienradar, Waze en ChatGPT (openai.com) zijn apps; swrve is achtergrond", () => {
  for (const [h, n] of [["api.buienradar.nl", "Buienradar"], ["gadgets.buienradar.nl", "Buienradar"], ["rtr.waze.com", "Waze"], ["api.openai.com", "ChatGPT"]] as const) {
    const c = classify(h);
    assert.equal(c.name, n, h);
    assert.equal(!c.bg && c.main, true, h);
  }
  assert.equal(classify("api.swrve.com").bg, true);
});

test("Nederlandse spelling seks wordt herkend; gewone sites niet", () => {
  for (const h of ["www.seksshop.nl", "gratis-seks.nl", "www.sekscontact.nl", "www.geil.nl", "neuken.com"]) assert.equal(classify(h).flag, "18+", h);
  for (const h of ["www.sussex.ac.uk", "www.essex.ac.uk", "www.rutgers.nl", "www.nu.nl", "www.seksualiteit-info.nl.invalid"]) assert.notEqual(classify(h).flag, "Dating", h);
  assert.notEqual(classify("www.sussex.ac.uk").flag, "18+");
  assert.notEqual(classify("www.rutgers.nl").flag, "18+");
});

test("merken met meer domeinen worden één regel", () => {
  assert.equal(classify("www.paypalobjects.com").site, "paypal.com");
  assert.equal(classify("www.paypal.com").site, "paypal.com");
  assert.equal(classify("www.lidlplus.nl").site, "lidl.nl");
  assert.equal(classify("www.marktplaats.com").site, "marktplaats.nl");
  assert.equal(classify("www.kruidvat.be").site, "kruidvat.nl");
});

test("strakker vangnet: Nederlandse sekssites, AI-uitkleed-apps, chat-met-vreemden en DNS-omzeiling", () => {
  for (const h of ["sexyladies.nl", "neukvrienden.nl", "seksverhalen.com", "oproepjes.nl", "clothoff.io", "nudify.online"]) assert.equal(classify(h).flag, "18+", h);
  for (const h of ["getwizz.com", "azarlive.com", "holla.world", "wink.app"]) assert.equal(classify(h).flag, "Dating", h);
  for (const h of ["vpn-api.proton.me", "dns.controld.com", "dns0.eu", "adguard-dns.io", "psiphon3.com"]) assert.equal(classify(h).flag, "VPN/proxy", h);
  for (const h of ["unisex-kapper.nl", "sekseneutraal.nl", "www.essex.gov.uk", "neukirchen.de", "www.sussex.ac.uk"]) assert.equal(classify(h).flag, undefined, h);
});

test("F1 TV en andere sport-/tv-apps zijn zichtbaar", () => {
  for (const h of ["f1tv.formula1.com", "api.formula1.com", "img.prod-ott.watchliveformula1.com"]) {
    const c = classify(h);
    assert.equal(c.name, "F1 TV", h);
    assert.equal(c.main, true, h);
  }
  assert.equal(classify("isl.dazn.com").name, "DAZN");
});

test("bekende sites worden altijd herkend (porno, seksshops, dating; wereldwijd en NL)", () => {
  const adult = "pornhub.com xvideos.com xnxx.com xhamster.com stripchat.com chaturbate.com onlyfans.com spankbang.com fansly.com hollandsecamgirls.nl islive.nl sexjobs.nl kinky.nl oproepjes.nl lovehoney.nl amorelie.nl christineleduc.nl easytoys.nl pabo.nl pleasureshop.nl erotischewebshop.nl";
  for (const h of adult.split(" ")) assert.ok(classify(h).flag, h); // 18+ of Dating: altijd rood
  const dating = "tinder.com bumble.com hinge.co badoo.com grindr.com parship.nl elitedating.nl relatieplanet.nl 50plusmatch.nl lexa.nl ashleymadison.com c-date.nl";
  for (const h of dating.split(" ")) assert.ok(classify(h).flag, h);
});

test("omweg via Google Translate wordt herkend", () => {
  assert.equal(classify("www-pornhub-com.translate.goog").flag, "18+");
  assert.equal(classify("tinder-com.translate.goog").flag, "Dating");
  assert.equal(classify("nos-nl.translate.goog").flag, undefined);
});

test("geen vals alarm op bekende gewone sites met een verdacht stukje in de naam", () => {
  for (const h of ["www.jeuxvideo.com", "www.xxxlutz.de", "www.tennisexplorer.com", "www.correosexpress.es", "www.lasexta.com", "www.aiimsexams.ac.in", "www.agriaffaires.com", "deusex.fandom.com", "www.emilfrey.si", "www.tvzoneuk.com", "www.alberoshop.it", "artsexperiments.withgoogle.com"]) assert.equal(classify(h).flag, undefined, h);
  for (const h of ["neukenx.be", "www.regiosexcontact.be", "www.naaktstrandje.nl", "realsexclub.com", "topsexhub.com"]) assert.equal(classify(h).flag, "18+", h);
});

test("controle: eigen app, betaalmodules en technische namen van tv-apps", () => {
  assert.equal(classify("csva.vercel.app").bg, true); // de app zelf is geen bezoek
  assert.equal(classify("pichya.nl").bg, true);
  assert.equal(classify("www.pichya.nl").bg, true);
  assert.equal(classify("m.stripe.com").bg, true); // betaalmodule binnen een webwinkel
  assert.equal(classify("videoland.bedrock.tech").name, "Videoland");
  assert.equal(classify("messagebroker-prod-nl.gnp.cloud.dmdsdp.com").name, "Ziggo GO"); // videoplatform van Ziggo (hzn-nl), niet van Disney+
  assert.equal(classify("disney.playback.edge.bamgrid.com").name, "Disney+");
  assert.equal(classify("api.parro.com").name, "Parro (school)");
});

test("Google: zoekpagina telt, Foto's/Gmail/inloggen op de achtergrond niet", () => {
  assert.equal(fgHit("google.com", "www.google.nl"), true);
  assert.equal(fgHit("google.com", "ogads-pa.clients6.google.com"), true);
  assert.equal(fgHit("google.com", "www.google.com"), false);
  assert.equal(classify("encrypted-tbn2.gstatic.com").site, "google.com");
  assert.equal(fgHit("google.com", "encrypted-tbn2.gstatic.com"), true);
  assert.equal(fgHit("google.com", "notifications-pa.googleapis.com"), false);
});

test("keurmerken in webwinkels zijn geen bezoek; nette namen", () => {
  assert.equal(classify("dashboard.webwinkelkeur.nl").bg, true);
  assert.equal(classify("widget.trustpilot.com").bg, true);
  assert.equal(classify("www.google.nl").name, "Google");
});

test("F1 TV: het videoadres hoort bij F1 TV en telt als kijken", () => {
  assert.equal(classify("d8penbt6jsl3i.cloudfront.net").name, "F1 TV");
  assert.equal(isMedia("d8penbt6jsl3i.cloudfront.net"), true);
  assert.equal(isMedia("ott-video-cf.formula1.com"), true);
});

test("ingesloten videospelers herkend", () => {
  assert.equal(isEmbedHost("player.vimeo.com"), true);
  assert.equal(isEmbedHost("www.youtube-nocookie.com"), true);
  assert.equal(isEmbedHost("vimeo.com"), false);
  assert.equal(isEmbedHost("www.youtube.com"), false);
});

test("afspeelsignaal telt als kijken, ook als NextDNS het blokkeert", async () => {
  const { isPlaying } = await import("./sites.ts");
  assert.equal(isPlaying("7ba3f64df98de730df38846b54ecfbdf7f61f80f.cws.conviva.com", true), true);
  assert.equal(isPlaying("rr3---sn-u15hn5-5t.googlevideo.com", true), false); // geblokkeerde video speelt niet
  assert.equal(isPlaying("rr3---sn-u15hn5-5t.googlevideo.com", false), true);
});

test("techniek van webwinkels is achtergrond; schoolsysteem hoort bij Parro", () => {
  for (const h of ["cdn.shopifycloud.com", "monorail-edge.shopifysvc.com", "mask.icloud.com.fastly-masque.net", "dev.visualwebsiteoptimizer.com", "a1.tuyaeu.com", "x.tm-azurefd.net"]) assert.ok(classify(h).bg, h);
  for (const h of ["www.kobo.com", "www.thinkific.com"]) assert.ok(!classify(h).bg, h);
  assert.equal(classify("app.parnassys.net").name, "Parro (school)");
  assert.equal(classify("www.parro.com").name, "Parro (school)");
});

test("advertentieteller van Bing in webwinkels is geen bezoek aan Bing; zoeken op Bing wel", () => {
  assert.ok(classify("bat.bing.com").bg);
  assert.ok(!classify("www.bing.com").bg);
});

test("adressen uit het eigen netwerk (router plakt .home/.lan erachter) zijn geen bezoek", () => {
  for (const h of ["image_intertoys.home", "printer.lan", "nas.localdomain"]) assert.ok(classify(h).bg, h);
});

test("Zappelin hoort bij NPO; Buienalarm (Infoplaza/Meteoplaza) is een eigen app", () => {
  for (const h of ["www.zappelin.nl", "vod.ak.md.npox.nl", "prod.npoplayer.nl"]) assert.equal(classify(h).name, "NPO", h);
  for (const h of ["ss.buienalarm.nl", "api.meteoplaza.com", "notifyhub.infoplaza.io"]) assert.equal(classify(h).name, "Buienalarm", h);
});

test("bank-app openen (bankieren.bank.nl) is de site zelf", () => {
  assert.ok(classify("bankieren.rabobank.nl").main);
  assert.ok(!classify("log.rabobank.nl").main);
});

test("inlog-/bankierpagina's herkennen", () => {
  for (const h of ["bankieren.rabobank.nl", "mijn.ing.nl", "inloggen.belastingdienst.nl", "login.decathlon.net"]) assert.ok(isLoginHost(h), h);
  for (const h of ["log.rabobank.nl", "www.rabobank.nl", "auth.split.io", "login.mso.msidentity.com", "account.apple.com", "auth.meethue.com"]) assert.ok(!isLoginHost(h), h);
});

test("webinar-, e-book- en cursusapps herkend", () => {
  assert.equal(classify("ggdhvb.webinargeek.com").name, "WebinarGeek (webinar)");
  assert.equal(classify("readingservices.kobo.com").name, "Kobo (e-books)");
  assert.equal(classify("happywithyoga.thinkific.com").name, "Thinkific (cursus)");
});

test("X/Twitter is één app; advertentietellers van X en Reddit op andere sites zijn achtergrond", () => {
  assert.equal(classify("x.com").name, "X (Twitter)");
  assert.equal(classify("api.twitter.com").name, "X (Twitter)");
  assert.equal(classify("pbs.twimg.com").site, classify("x.com").site);
  for (const h of ["static.ads-twitter.com", "analytics.twitter.com", "alb.reddit.com"]) assert.ok(classify(h).bg, h);
  assert.equal(classify("www.reddit.com").name, "Reddit");
});

test("doorstuur-links en inlog/privacy van mediabedrijven zijn geen eigen bezoek", () => {
  for (const h of ["ift.tt", "bit.ly", "login.dpgmedia.nl", "myprivacy.dpgmedia.net"]) assert.ok(classify(h).bg, h);
  assert.ok(!classify("www.nu.nl").bg);
});

test("netwerkmeting van de Facebook/Instagram-app telt als gebruik (alleen als de app open staat)", () => {
  assert.equal(fgHit("facebook.com", "cc8ffdab-0a59-4e51-b1d3-7d75d23f48fe-netseer-ipaddr-assoc.xy.fbcdn.net"), true);
  assert.equal(fgHit("facebook.com", "mqtt.c10r.facebook.com"), false);
});

test("door de eigenaar goedgekeurd: vkmag.com is geen 18+-melding, echte 18+ blijft rood", () => {
  for (const h of ["vkmag.com", "www.vkmag.com", "cdn.vkmag.com"]) assert.equal(classify(h).flag, undefined);
  assert.equal(classify("www.pornhub.com").flag, "18+");
});

test("chatknop in een andere site (replain, intercom, tawk) is achtergrond, geen bezoek", () => {
  for (const h of ["app.replain.cc", "widget.replain.cc", "widget.intercom.io", "embed.tawk.to", "client.crisp.chat"]) assert.equal(classify(h).bg, true, h);
  assert.equal(classify("www.vkmag.com").bg, false);
});

test("Amazon-meetadres (minerva.devices.a2z.com) is achtergrond, geen app-gebruik", () => {
  const c = classify("b79c.us-east-1.prod.service.minerva.devices.a2z.com");
  assert.equal(c.bg, true);
  assert.equal(c.main, false);
  assert.equal(classify("www.amazon.nl").main, true);
});

test("kanaalplaatjes van YouTube (yt3.ggpht.com) horen bij YouTube; andere ggpht-adressen niet", () => {
  assert.equal(classify("yt3.ggpht.com").name, "YouTube");
  assert.equal(classify("yt3.googleusercontent.com").name, "YouTube");
  assert.notEqual(classify("lh3.ggpht.com").name, "YouTube");
});

test("affiliate-links en widgets van andere sites zijn geen bezoek; tv-app- en spel-adressen worden herkend", () => {
  for (const h of ["www.awin1.com", "tc.tradetracker.net", "bigspark.link", "app.tolkie.nl", "surfly.com", "usizy.com", "snapwidget.com", "www.giftomatic.io"]) assert.equal(classify(h).bg, true, h);
  assert.equal(classify("force.thuisbioscoop.nl").name, "Pathé Thuis");
  assert.equal(classify("force-public-alb-production-688060324.eu-central-1.elb.amazonaws.com").name, "Pathé Thuis");
  assert.equal(classify("other-alb-production-1.eu-central-1.elb.amazonaws.com").bg, true); // andere Amazon-servers blijven achtergrond
  assert.equal(classify("apps.tutotoons.com").name, "TutoTOONS (spel)");
  assert.equal(classify("vast.tutoads.tv").name, "TutoTOONS (spel)");
  for (const h of ["svip.bobo-world.com", "www.kalegames.com", "cp.papoworld.com"]) assert.equal(classify(h).name, "BoBo World (spel)", h);
  assert.notEqual(classify("www.bobo.com").name, "BoBo World (spel)"); // geen vals alarm op een gelijkende naam
  assert.equal(classify("my.amayakids.com").name, "Amaya Kids (leren)");
  for (const h of ["www.chatbase.co", "backend.chatbase.co"]) assert.equal(classify(h).bg, true, h); // chatknop in een andere site
  for (const h of ["shop.app", "server.shop.app", "api.judge.me", "tracking.aws.judge.me"]) assert.equal(classify(h).bg, true, h); // onderdelen van Shopify-winkels
  assert.equal(classify("www.shopapotheke.com").bg, false); // geen vals alarm
  assert.equal(classify("www.chatbaas.nl").bg, false); // geen vals alarm
  for (const h of ["ipapi.co", "api.ipify.org"]) assert.equal(classify(h).bg, true, h); // IP/land-opzoekdienst van apps
  assert.equal(classify("www.ipapotheek.nl").bg, false); // geen vals alarm
  // geen vals alarm: gewone sites met een vergelijkbaar stukje in de naam blijven gewone sites
  assert.equal(classify("www.awin.nl").bg, false);
  assert.equal(classify("www.tolkien.nl").bg, false);
  assert.equal(isNeverFlag("www.vkmag.com"), true); // door de eigenaar goedgekeurd
  assert.equal(isNeverFlag("www.voorbeeldsite.nl"), false);
});

test("cursusportaal en ingebouwde onderdelen: academy. is een pagina, embed. en platformbestanden niet", () => {
  assert.equal(classify("academy.cursussite.nl").main, true);
  assert.equal(isEmbedHost("embed.toolsite.com"), true);
  assert.equal(isEmbedHost("www.embedded.nl"), false); // geen vals alarm op een gewone naam
  assert.equal(classify("cdn.thinkific.com").bg, true); // bestanden van het platform
  assert.equal(classify("school.thinkific.com").name, "Thinkific (cursus)"); // een eigen Thinkific-school blijft herkend
  assert.equal(classify("ecomm.events").bg, true);
  assert.equal(classify("www.events.nl").bg, false);
  // Microsoft: Teams/Office-verkeer en het eigen netwerk (zoals office.com al was), geen site
  for (const h of ["s-0006.dual-s-dc-msedge.net", "s-0005.dual-s-msedge.net", "ax-0003.ax-msedge.net", "res.cdn.office.net", "teams.nel.measure.office.net"]) assert.equal(classify(h).bg, true, h);
  assert.equal(classify("www.boxoffice.nl").bg, false);
  assert.equal(classify("www.edgenet.nl").bg, false);
});

test("meetbakens zonder eigen pagina (fastly-insights, prodregistryv2) zijn achtergrond; een gewone site niet", () => {
  for (const h of ["www.fastly-insights.com", "prodregistryv2.org"]) assert.equal(classify(h).bg, true, h);
  assert.equal(classify("www.werkenbijbevolkingsonderzoek.nl").bg, false);
});

test("vangnet: dating-app Raya en Cloudflare WARP (gratis VPN-app) worden herkend; Cloudflare zelf en Reddit niet", () => {
  for (const h of ["app.raya.co", "api.rayatheapp.com"]) assert.equal(classify(h).flag, "Dating", h);
  assert.equal(classify("warp.cloudflare.com").flag, "VPN/proxy");
  for (const h of ["www.cloudflare.com", "dash.cloudflare.com", "www.reddit.com"]) assert.equal(classify(h).flag, undefined, h);
});

test("advertentie-teller van OpenAI op een webwinkel is geen ChatGPT-gebruik; de ChatGPT-app zelf wel", () => {
  for (const h of ["bzr.openai.com", "bzrcdn.openai.com"]) assert.equal(classify(h).bg, true, h);
  for (const h of ["ios.chat.openai.com", "ws.chatgpt.com", "chatgpt.com"]) assert.equal(!classify(h).bg && classify(h).main, true, h);
});

test("Meditopia (meditatie-app) is een app", () => {
  for (const h of ["api.meditopia.com", "media.meditopia.com", "images.meditationapp.co"]) { assert.equal(classify(h).name, "Meditopia", h); assert.equal(classify(h).main && !classify(h).bg, true, h); }
});
