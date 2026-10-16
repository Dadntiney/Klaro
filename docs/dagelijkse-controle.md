# Dagelijkse controle (Klaro op pichya.nl)

Doel: de eigenaar hoeft niets zelf na te checken. Elke ochtend draait een controle in een nieuwe Claude-sessie.

## Nodig in de Claude-omgeving (eenmalig, door de eigenaar)
- Netwerktoegang tot `pichya.nl`.
- Omgevingsvariabele `KLARO_PW` = het inlogwachtwoord van Klaro. Nooit in een bestand, commit, log of bericht zetten.

## Stappen
1. Overzicht ophalen, precies zoals de pagina het berekent (zelfde code, via pichya.nl/api/nd.php):

       node --experimental-strip-types scripts/overzicht.ts > /tmp/overzicht.json

2. Vaste voorbeelden: `node --experimental-strip-types scripts/referentie.ts /tmp/overzicht.json` moet volledig kloppen.
3. Mogelijk gemist: `node --experimental-strip-types scripts/gemist.ts /tmp/overzicht.json`. Zoek bij elk geval de oorzaak
   (adressen rond dat moment: `nd.php?q=from=...&to=...&device=...`).
4. Kloppen de regels zelf? Over alle opgeslagen dagen (duurt ~2 minuten):

       node --experimental-strip-types scripts/controle.ts

   Dat toont, elk als lijstje (leeg = in orde):
   - **Vangnet**: adressen op de 18+/datinglijst of met duidelijke woorden (porn, dating, vpn, versleutelde dns) die niet rood
     zijn; wat rood/verdacht getoond is; wat NextDNS als gevaarlijk blokkeerde.
   - **Achtergrond die vaak los voorkomt**: misschien ten onrechte achtergrond (echt gebruik dat we verbergen).
   - **Getoond, maar elke keer vlak na een andere pagina**: misschien een onderdeel van die pagina (widget, zustersite).
   - **Onbekend met veel verkeer**: misschien een app die we nog niet kennen (zoals een spel op de iPad).
   - **Chip en rij nagespeeld**: elke 10 minuten van het laatste etmaal; moeten steeds hetzelfde zeggen.
   - **Ritme**: een site die kort en regelmatig terugkomt (open tabblad, widget; zoals Canva op de MacBook).
   - **Veel korte rijen op één dag**: achtergrond of echt kort gebruik? (WhatsApp kort openen is normaal.)
   - **App misschien geopend maar niet getoond**: veel adressen van een app binnen 5 s zonder rij (gemist openen?).
   Regels met `*` zijn van de laatste 3 dagen: die eerst. Elk punt nalopen in de ruwe regels; is het niet zeker uit de
   gegevens, dan niets veranderen maar de eigenaar één concrete vraag stellen ("Is op 16 okt om 08:41 op de iPad Netflix
   gekeken?"). Het antwoord wordt een referentiegeval.

   Open vragen (wacht op antwoord van de eigenaar):
   - Netflix op de iPad wordt ongeveer elk uur op de achtergrond wakker (push., ios.prod., logs., www., zonder beeld) en
     geeft dan korte rijen. Een regel "alleen met plaatjes/video" haalt die weg, maar kort ook lange kijksessies in
     (tijdens kijken komen er soms geen nieuwe opvragingen). Eerst bevestigen wat echt kijken was.

   Al nagelopen en in orde (niet opnieuw uitzoeken, tenzij het verandert): `k8s-sdkvpnde…amazonaws.com` (VPN-check in de
   Vinted-app, geen VPN), app-analytics-services.com, media-amazon.com (plaatjes in de Amazon-app), gravatar.com
   (profielfoto's in een webinar-chat), googletagmanager.com, en in "onbekend": tellers, meetdiensten en filmspelers.
5. Echte gaten algemeen oplossen (APPS, BACKGROUND, regels), altijd eerst doorgerekend over de hele CSV (vóór/na vergelijken,
   elk verschil nalopen), met tests (herkend én geen vals alarm) en een referentiegeval.
6. `npm test`, `npx tsc --noEmit`, `npx next build` moeten slagen. Dan naar `main`: GitHub zet het via SFTP live en
   controleert pichya.nl. Daarna stap 1, 2 en 4 opnieuw.
7. Kort melden in eenvoudig Nederlands wat er is opgelost; niets gevonden = één zin.
