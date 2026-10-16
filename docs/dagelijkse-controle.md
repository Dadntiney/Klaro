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
   Regels met `*` zijn van de laatste 3 dagen: die eerst. Elk punt zelf uitzoeken in de ruwe regels: zet alle sessies van die
   app/site over alle dagen naast elkaar (welke adressen, hoe lang, beeld of niet) en zoek het patroon dat echt gebruik van
   achtergrond scheidt (voorbeeld Netflix: sessies zonder beeld en plaatjes zijn altijd kort; elke lange sessie heeft beeld).
   De eigenaar niets vragen wat uit de gegevens te halen is. Vind je geen patroon dat zeker is: niets veranderen, onder
   "Nog uitzoeken" zetten en de volgende dagen opnieuw bekijken (meer dagen = meer bewijs). Wat geleerd is komt onder "Geleerd".

   Wordt het NextDNS-logboek leeggemaakt: de regels staan in de code en blijven. Referentiegevallen van dagen die er niet
   meer zijn worden overgeslagen; wat Klaro uit de geschiedenis afleidt (widgets, vaste hulpjes) staat vast in lib/geleerd.ts.

   Geleerd (niet opnieuw uitzoeken): Netflix op een telefoon/tablet wordt elk uur op de achtergrond wakker; zonder beeld
   en zonder plaatjes is dat nooit langer dan 2 minuten en geen kijken (opgelost, 16 okt). Canva-tabblad dat zich elke ~6 min
   meldt: geen gebruik (opgelost). WhatsApp kort openen geeft veel korte rijen: normaal. Facebook/Instagram vragen vaak veel
   adressen op de achtergrond op (mqtt, gateway, graph): zonder plaatjes geen gebruik.

   Nog uitzoeken: bij NPO (Zappelin) en Videoland herkent Klaro het beeld nog niet volledig: licentie- en video-adressen
   (drm.npoplayer.nl, fairplay.npo.nl, download.cdn.streamgate.nl, drm.videoland.bedrock.tech) tellen niet als beeld.
   Uitzoeken over alle dagen of die altijd en alleen bij kijken voorkomen; dan als beeld laten tellen (net als bij Netflix).

5. Echte gaten algemeen oplossen (APPS, BACKGROUND, regels), altijd eerst doorgerekend over de hele CSV (vóór/na vergelijken,
   elk verschil nalopen), met tests (herkend én geen vals alarm) en een referentiegeval.
6. Geleerde kennis vastleggen (blijft ook als het NextDNS-logboek wordt leeggemaakt):

       node --experimental-strip-types scripts/leer.ts /tmp/overzicht.json

   Dat vult lib/geleerd.ts aan (widgets/open tabbladen en vaste hulpjes, met datum "laatst gezien"; geldt 90 dagen na de laatste
   bevestiging). Is het bestand veranderd: meenemen in de commit.
7. `npm test`, `npx tsc --noEmit`, `npx next build` moeten slagen. Dan naar `main`: GitHub zet het via SFTP live en
   controleert pichya.nl. Daarna stap 1, 2 en 4 opnieuw.
8. `docs/laatste-controle.md` bijwerken (datum van vandaag + één regel resultaat) en meenemen in de laatste commit van de dag,
   ook als er niets veranderd is. Daaraan ziet de bewaking (`.github/workflows/leren.yml`) dat de controle gedraaid heeft.
9. Kort melden in eenvoudig Nederlands wat er is opgelost; niets gevonden = één zin.
