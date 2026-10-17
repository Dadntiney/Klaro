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
   YouTube op de Apple TV: tijdens het kijken komt de video over een open verbinding; alleen de kijktijd-melding aan
   www.youtube.com is te zien. Telt als kijken als hij aansluit op echte inhoud (KEEP_ALIVE, opgelost 17 okt).
   Een adres met "vpn" van Amazon (k8s-sdkvpnde-...elb.amazonaws.com) vlak na Vinted: VPN-controle van de app zelf
   (samen met conn-check.icg-in.com), geen VPN. analytics.tiktok.com (geblokkeerd) op websites: TikTok-teller, geen TikTok.
   Waze: onderweg komen kaartstukjes maar elke 4 tot 17 minuten; stukjes met hooguit 20 minuten ertussen zijn één rit (NAV_APPS,
   opgelost 17 okt). Op de achtergrond vraagt Waze niets op.
   Doorverwijs-adressen: veel apps praten via een cloud-adres (Amazon-loadbalancer, CloudFront, Akamai, Fastly) waar hun eigen
   adres naar doorverwijst; dat cloud-adres staat vaker in het logboek dan het eigen adres. Toca Boca meldt zo elke 2 à 2,5 min
   tijdens het spelen. Klaro herkent zo'n koppeling zelf (followers() in lib/companion.ts, vastgelegd in lib/geleerd.ts) en telt
   het cloud-adres mee zolang het aansluit op de app (opgelost 17 okt; ook Budge, Spotify, NPO, Videoland, Disney+, Buienradar).

   Nog uitzoeken: bij NPO (Zappelin) en Videoland herkent Klaro het beeld nog niet volledig: licentie- en video-adressen
   (drm.npoplayer.nl, fairplay.npo.nl, download.cdn.streamgate.nl, drm.videoland.bedrock.tech) tellen niet als beeld.
   Uitzoeken over alle dagen of die altijd en alleen bij kijken voorkomen; dan als beeld laten tellen (net als bij Netflix).
   Chip en rij: op 17 okt 08:59 (iPad) was de chip groen (spel-verkeer van Unity) terwijl er geen rij "nu" was, precies op
   het moment dat NPO begon. 1 van 434 momenten; nagaan of dit vaker gebeurt bij het wisselen van app.

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
