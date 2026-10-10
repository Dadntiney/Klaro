import { test } from "node:test";
import assert from "node:assert/strict";
import { isEspHost, isMailClientHost, isMailSession } from "./mail.ts";
import { isHuman } from "./sessions.ts";

test("adressen van mailbedrijven en nieuwsbrieven", () => {
  for (const h of ["getdrezzed.activehosted.com", "u13293599.ct.sendgrid.net", "cdn.klaviyomail.com", "ctrk.klclick1.com", "abc.click-sap.sfmc-marketing.com", "interface.mailcampaigns.nl", "hema.slgnt.eu", "email-tracking.infobip.com", "newsletter.pierreetvacances.com", "www-lidl-nl.ax4z.com", "url3336.aimn.com", "click.e.zalando.com", "nieuwsbrief.ah.nl", "gallery.mailchimp.com", "r.eu-west-1.awstrack.me"]) assert.ok(isEspHost(h), h);
  for (const h of ["www.lidl.nl", "images1.vinted.net", "www.hema.nl", "nos.nl", "news.google.com", "image.coolblue.nl", "www.ah.nl", "click.nl"]) assert.ok(!isEspHost(h), h);
  for (const h of ["eas.outlook.com", "p42-imap.mail.me.com", "imap.mail.me.com.akadns.net", "imap.gmail.com", "imap.ziggo.nl"]) assert.ok(isMailClientHost(h), h);
  assert.ok(!isMailClientHost("www.outlook.nl"));
});

test("kort bezoek tegelijk met een geopende nieuwsbrief is mail, een echte klik daarna niet", () => {
  const t = 1_000_000_000;
  const esp = [t - 5_000, t + 2_000];
  assert.ok(isMailSession({ s: t, e: t + 3_000, n: 3 }, esp, []));
  assert.ok(isMailSession({ s: t, e: t + 3_000, n: 3 }, [t + 1_000], [t - 60_000])); // 1 mailbedrijf + mail opgehaald
  assert.ok(!isMailSession({ s: t, e: t + 3_000, n: 3 }, [t + 1_000], [])); // 1 los adres: te weinig
  assert.ok(!isMailSession({ s: t, e: t + 3_000, n: 3 }, [t - 600_000, t - 590_000], [])); // ver weg
  assert.ok(!isMailSession({ s: t, e: t + 240_000, n: 30 }, esp, [])); // doorgeklikt en echt gekeken
  assert.equal(isHuman({ s: t, e: t + 70_000, n: 7, ml: 1 }), false);
  assert.equal(isHuman({ s: t, e: t + 300_000, n: 40, ml: 1 }), true); // later doorgegaan: wel zichtbaar
});
