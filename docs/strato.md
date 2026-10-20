# Klaro op Strato (pichya.nl)

Klaro draait op Strato-webhosting (PHP) in plaats van Vercel. Alles wat telt (wat echt gebruik is, het vangnet, sessies)
draait in de browser met precies dezelfde code als voorheen. De server (map `php/`) doet alleen wat geheim moet blijven:

| Bestand | Wat |
|---|---|
| `api/nd.php` | doorgeefluik naar NextDNS met de geheime sleutel (`?q=` voor /logs, `?download=1` voor alles uit de kopie, `&oud=1` = rechtstreeks de hele download) |
| `api/store.php` | eigen kopie van het logboek (`_private/logs.sqlite`): eens per minuut alleen nieuwe regels (raw /logs), gelijk aan de download; test: `php tests/store.php` |
| `api/alert.php` | voor de waarschuw-taak (GitHub, elke 5 min, `scripts/waarschuw.ts`): nieuwe regels + abonnementen; alleen met de taaksleutel (hash in `_private/alert.key`) |
| `api/push.php` | meldingen aan/uit op dit toestel (na inloggen); abonnementen in `_private/push.json` |
| `api/info.php` | alleen-lezen: bewaartermijn van NextDNS en welke databases de server heeft (na inloggen) |
| `api/lists.php` | welke adressen op de 18+/datinglijst staan (lijsten per vakje in `api/_private/lists/`) |
| `api/login.php` | inloggen: nieuwe sessie per apparaat (willekeurig cookie; op de server alleen de hash in `_private/sessions.json`) |
| `api/activity.php` | de pagina meldt hier echt gebruik (tikken, scrollen, typen; hooguit eens per minuut, alleen vanuit een tabblad in beeld) |
| `api/gate.php` | de pagina zelf (`/`) alleen met een geldige sessie; anders naar het inlogscherm |
| `api/logout.php` | uitloggen: dit apparaat, of alle apparaten |
| `api/setup.php` | eenmalig: NextDNS-sleutel, profiel-ID en wachtwoord invullen; daarna dicht |
| `api/_private/` | instellingen en lijsten, via `.htaccess` nooit van buitenaf te openen |

## Inloggen en automatisch uitloggen
- Na **60 minuten zonder echt gebruik** (op geen enkel apparaat) zijn alle sessies ongeldig en is opnieuw inloggen nodig. De
  server dwingt dit af; live bijwerken, alles ophalen en andere automatische verzoeken verlengen niets.
- Gebruik op het ene apparaat of tabblad houdt de andere geldig (één eigenaar, één wachtwoord).
- Scripts (dagelijkse controle) loggen per verzoek in met het wachtwoord (basic-auth); dat maakt of verlengt geen sessie.
- Tests: `php tests/sessies.php` (draait ook bij elke update).

## Live zetten
Elke wijziging op `main` gaat via GitHub Actions ("Live zetten op Strato", `.github/workflows/strato.yml`) met SFTP naar
de map uit `deploy/strato.json`, en daarna wordt gecontroleerd dat pichya.nl werkt en `_private` dicht is.
Nodig in GitHub: het geheim `STRATO_SFTP_PASSWORD`. Instellingen op de server (`config.php`) worden nooit overschreven.

## Eenmalig (eigenaar)
1. GitHub → Settings → Secrets and variables → Actions → New repository secret: `STRATO_SFTP_PASSWORD` = het SFTP-wachtwoord.
2. Na de eerste upload: open https://pichya.nl/api/setup.php en vul de NextDNS API-sleutel, het profiel-ID en een nieuw
   inlogwachtwoord in. Daarna is die pagina dicht.

## Zelf controleren
`KLARO_PW=... node --experimental-strip-types scripts/overzicht.ts > overzicht.json` geeft het overzicht zoals de pagina het
berekent; daarna `scripts/referentie.ts` en `scripts/gemist.ts` erop.

## Waarschuwen (pushmeldingen)
- `.github/workflows/waarschuw.yml` draait elke 5 minuten `scripts/waarschuw.ts`: dezelfde herkenning als de pagina (lib/sites.ts,
  data/-lijsten). Rood (18+, dating, VPN/proxy, door NextDNS geblokkeerde porno/dating) = melding, één keer per apparaat + site per 3 uur.
- Sleutels (`lib/webpush.ts`) worden afgeleid van het geheim `STRATO_SFTP_PASSWORD`; bij het live zetten komen alleen de openbare
  push-sleutel en de hash van de taaksleutel op de server (`scripts/sleutels.ts`). Verandert dat geheim, dan meldingen opnieuw aanzetten.
- Ook: "apparaat stil" (langer dan 2× de langste pauze van 14 dagen en minstens 3 uur, alleen apparaten die bijna dagelijks actief
  zijn; hooguit eens per dag) en een weekbericht op zondag 19-21 uur ("Waarschuwen werkt"). Draaide de taak een uur niet goed, dan
  staat dat onderaan in Klaro (rood); de dagelijkse controle kijkt het ook na.
- Op de iPhone: Klaro op het beginscherm zetten, daar openen, onderaan "Meldingen aan". Binnen ~15 min komt een proefmelding.
