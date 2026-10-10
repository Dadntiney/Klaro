/**
 * Herkenning van e-mail (nieuwsbrieven): als een mail wordt geopend, laadt het apparaat binnen een paar seconden plaatjes
 * en tellers van een mailbedrijf (Sendgrid, Mailchimp, Klaviyo, Salesforce, ActiveCampaign, ...) en van het merk zelf.
 * Die merkadressen zijn dan geen bezoek. Een kort "bezoek" tegelijk met mailverkeer wordt daarom als mail gezien.
 * Apart bestand zonder node-modules: wordt ook in de browser gebruikt.
 */

/** Adressen van mailbedrijven (verzenden, openen tellen, links bijhouden, plaatjes in mails). */
const ESP_SUFFIX = [
  "activehosted.com", "acemlna.com", "acemlnb.com", "acemlnc.com", "acemlnd.com", "acems1.com", "acems2.com", "acems5.com",
  "sendgrid.net", "sendgrid.com", "list-manage.com", "mcusercontent.com", "mcsv.net", "mailchimp.com", "mailchimpapp.net",
  "klaviyomail.com", "klclick.com", "klclick1.com", "klclick2.com", "klclick3.com", "sfmc-marketing.com", "exacttarget.com", "exct.net",
  "mailcampaigns.nl", "mailplus.nl", "spotler.com", "spotlermail.com", "laposta.nl", "mailjet.com", "mjt.lu", "sparkpostmail.com",
  "rs6.net", "createsend.com", "createsend1.com", "cmail19.com", "cmail20.com", "hubspotemail.net", "hubspotlinks.com",
  "customeriomail.com", "slgnt.eu", "slgnt.us", "emsecure.net", "copernica.com", "cpnc.nl", "rsys5.com", "rsys2.com", "neolane.net",
  "mandrillapp.com", "postmarkapp.com", "awstrack.me", "mailgun.org", "deployteq.net", "flowmailer.net", "anpdm.com", "dmtrk.net",
  "trackedlink.net", "emv2.com", "emv3.com", "sendibt2.com", "sendibt3.com", "sendibm1.com", "mlsend.com", "convertkit-mail.com",
  "convertkit-mail2.com", "ck.page", "emltrk.com", "movableink.com", "movable-ink-7158.com", "niftyimages.com", "kickdynamic.com",
  "email-tracking.infobip.com", "ax4z.com", "aimn.com", "agnitas.de", "emarsys.net", "mailing.dpgmedia.nl", "e-mailing.nl",
  "mktomail.com", "bmetrack.com", "bme1.net", "ccsend.com",
];
/** Eerste deel van een adres dat typisch bij nieuwsbrieven hoort (email.merk.nl, nieuwsbrief.merk.nl, click.e.merk.nl). */
const ESP_LABEL = /^(email|e-mail|emails|mail[0-9]*|mailing|mailings|news|newsletter|newsletters|nieuwsbrief|nieuwsbrieven|click|clicks|links|link|ct|ctrk|trk|track|tracking|url[0-9]+|e|em|eml|go|info|t|r|s|view|image|images|img)\.(e|email|em|mail|news|mailing|link|links|click|t)\./;
const ESP_LABEL2 = /^(email|e-mail|mailing|mailings|newsletter|newsletters|nieuwsbrief|nieuwsbrieven|url[0-9]+|click-[a-z0-9]+|tracking\.news[-a-z0-9]*|engage|subscriptions?|unsubscribe|mailer|campaigns?)\./;

/** Mailprogramma's die nieuwe mail ophalen (Apple Mail, Outlook, Gmail, providers). */
const CLIENT = /(^|\.)(imap(\.mail)?\.me\.com|p[0-9]+-imap\.mail\.me\.com|imap\.gmail\.com|eas\.outlook\.com|outlook\.office365\.com|imap-mail\.outlook\.com|outlook\.office\.com|imap\.[a-z0-9-]+\.[a-z]+|pop3?\.[a-z0-9-]+\.[a-z]+|mail\.google\.com|inbox\.google\.com)(\.akadns\.net)?$|^[a-z0-9-]+\.outlook\.[a-z0-9.-]*svc\.cloud\.microsoft$/;

export function isEspHost(host: string): boolean {
  if (ESP_SUFFIX.some((s) => host === s || host.endsWith("." + s))) return true;
  return ESP_LABEL.test(host) || ESP_LABEL2.test(host);
}

export function isMailClientHost(host: string): boolean {
  return CLIENT.test(host);
}

/** Venster rond een kort bezoek waarin mailverkeer moet zitten. */
export const MAIL_WINDOW = 60_000;

/**
 * Hoort een korte sessie bij het openen van een mail? Alleen korte sessies (een paar verzoeken, hooguit anderhalve minuut):
 * wie in een mail op een link klikt en echt op de site gaat kijken, maakt een langere sessie en blijft zichtbaar.
 * `esp` en `client`: tijdstippen van mailbedrijf- en mailprogramma-verkeer van hetzelfde apparaat (oplopend gesorteerd of niet).
 */
export function isMailSession(x: { s: number; e: number; n?: number }, esp: number[], client: number[]): boolean {
  if ((x.n ?? 1) > 8 || x.e - x.s > 90_000) return false;
  const near = (arr: number[], w: number) => arr.filter((t) => t >= x.s - w && t <= x.e + w).length;
  const e = near(esp, MAIL_WINDOW);
  if (e >= 2) return true;
  return e >= 1 && near(client, 120_000) >= 1;
}
