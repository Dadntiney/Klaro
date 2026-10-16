# Klaro op Strato (pichya.nl)

Klaro draait op Strato-webhosting (PHP) in plaats van Vercel. Alles wat telt (wat echt gebruik is, het vangnet, sessies)
draait in de browser met precies dezelfde code als voorheen. De server (map `php/`) doet alleen wat geheim moet blijven:

| Bestand | Wat |
|---|---|
| `api/nd.php` | doorgeefluik naar NextDNS met de geheime sleutel (`?q=` voor /logs, `?download=1` voor alles, 2 min bewaard) |
| `api/lists.php` | welke adressen op de 18+/datinglijst staan (lijsten per vakje in `api/_private/lists/`) |
| `api/login.php` | inloggen (cookie 180 dagen, zelfde handtekening als vroeger; ook basic-auth voor scripts) |
| `api/setup.php` | eenmalig: NextDNS-sleutel, profiel-ID en wachtwoord invullen; daarna dicht |
| `api/_private/` | instellingen en lijsten, via `.htaccess` nooit van buitenaf te openen |

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
