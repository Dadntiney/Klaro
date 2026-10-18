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
   Tabbladen opnieuw geladen: komt Safari/Chrome weer in beeld, dan ververst hij alle open tabbladen tegelijk (zondag 11 okt
   17:09: tien sites in 17 s). Vier of meer sites binnen 20 s die elk maar even laden: geen bezoek (opgelost 17 okt).
   Zelfde merk met een andere extensie kort na elkaar (ravensburger.nl + ravensburger.cloud): één bezoek (opgelost 17 okt).
   Vaste melding (heartbeat) via een doorverwijs-adres: meestal elke 1-5 min, soms tot 10 min (Toca Boca 17 okt 12:12-12:42);
   stukjes met hooguit 10 min ertussen zijn één keer spelen (HEARTBEAT_GAP, alleen als het adres vaak los terugkomt).
   Spel-motor (Unity, Amplitude, Singular, ironSource, ...): tijdens spelen elke 0-6 min meetgegevens (vaak geblokkeerd, wel in het
   logboek); hoort bij het spel dat speelt (GAME_SDK, assignGameSdk), zolang er geen andere app opende (opgelost 17 okt).
   Losse www.google.com zonder zoekresultaten: een app/spel dat opstart (advertentiemodule), geen zoekopdracht; over alle dagen
   17 van 18 tegelijk met een app (opgelost 17 okt). Dezelfde app een uur later = een nieuwe rij (samenvoegen alleen binnen 15 min).
   Ook één moment met alleen www.google.nl/.com (zonder zoekpagina) tegelijk met Google-meetcode van een andere site (Squla): geen
   zoekopdracht; over alle dagen 6 keer, nooit met een zoekpagina (opgelost 17 okt).
   Telefoon ontgrendeld/op wifi: veel apps verversen in dezelfde seconden. Een korte app-rij die dan begint (2+ andere apps,
   die zelf niet gebruikt worden; meetmodules in een app tellen niet) is onzeker, geen feit (17 okt 07:24 WhatsApp).

   Zelf leren (controle.ts, sectie 12; lib/selflearn.ts): Klaro leert elke berekening zelf welke adressen bewijzen dat een app
   echt open is (zeker gebruik = link uit de app of bekende inhoud; zeker achtergrond = nacht zonder ander gebruik). Elke dag
   nalopen wat nieuw geleerd is (doorrekenen over de hele CSV) en wat nog wacht; leer.ts legt het vast in lib/geleerd.ts.
   Vangnet: elke dag nagaan of nieuwe dating-, 18+- en VPN-apps (ook hun app-adressen, niet alleen de website) herkend worden.

   Rij voor rij (controle.ts, sectie 11) en na ELKE wijziging: het hele overzicht van vandaag naast het ruwe logboek leggen
   (niet alleen de aangepaste rij). Rijen die tegelijk met een app beginnen of als één moment midden in een app vallen, zijn
   vaak iets wat die app laadt (Google-advertentiemodule, meetcode). De eigenaar mag deze fouten niet eerder zien dan ik.

   Versnipperd gebruik (controle.ts, sectie 10): apps waarvan het gebruik in 3+ stukjes valt met 5-15 min ertussen. Zo zagen
   de gemiste Toca Boca-speelbeurt en de Waze-rit eruit. Altijd eerst de verdeling van de pauzes over ALLE dagen meten (kleinste,
   gewone en grootste pauze), nooit een grens kiezen uit één voorbeeld.

   Geleerd (17 okt): een groep die met een achtergrondadres begint (beacon.shazam.com), heet in het overzicht helemaal
   achtergrond, ook als daarna echte app-adressen komen. Zo bleef Shazam onzichtbaar en zag ook de controle het niet.
   Controle 5b telt daarom per adres: onbekende app die los opent (2+ eigen adressen tegelijk, geen website vlak ervoor).
   Shazam is nu een app; beacon.shazam.com (dag en nacht) telt niet mee.
   Geleerd (17 okt): Instagram gebruikt veel Facebook-adressen (graph/gateway/edge-mqtt/star.c10r.facebook.com, de netwerkmeting
   *-netseer-ipaddr-assoc.*.fbcdn.net, scontent-*.xx.fbcdn.net). Daardoor stond Instagram-gebruik als "Facebook" in het overzicht,
   of dubbel (Instagram én Facebook). Een gedeeld adres hoort nu bij de app van het dichtstbijzijnde eigen adres (5 min);
   eigen Facebook-adressen zijn alleen die Instagram nooit gebruikt (lookaside, chat-e2ee, web., video-/static-/external-*).
   Geleerd (18 okt): bzr.openai.com / bzrcdn.openai.com is een advertentie-teller van OpenAI op webwinkels (gaf een nep-ChatGPT-rij);
   staat nu op achtergrond. Zelf leren slaat adressen over die websites meeladen (pixels/tags), want die lijken anders bewijs.
   "sdkvpn…elb.amazonaws.com" met conn-check.icg-in.com is de VPN-controle van de Vinted-website (DataDome), geen VPN.
   Geleerd (17 okt): de Facebook-pixel op websites (connect.facebook.net met scontent.xx/star-mini/www.facebook.com in dezelfde
   seconden) maakte nep-Facebook-rijen en rekte echte rijen op (en gaf vals "scrollen in Facebook" bij ravensburger 11 okt).
   Telt nu niet meer, behalve als de Facebook-app zelf binnen een minuut actief is (website geopend vanuit Facebook).
   Geleerd (17 okt): op de pagina won live steeds van de herberekening zolang live nieuwer was; wie op een site bleef klikken,
   zag de rij pas als hij klaar was (neoseum.com). Nu is de herberekening leidend en voegt live alleen de nieuwste minuten toe.
   Geleerd (17 okt): Waze vraagt tijdens een rit soms 20 min niets eigens op, alleen elke ~1,5 min firebaselogging-pa (Google,
   geblokkeerd). Die melding komt alleen als er een app open is (85 reeksen, 1 's nachts), maar veel apps gebruiken hem; daarom
   telt hij alleen aansluitend op een navigatie-app zonder andere app ertussen. Niet bij spellen (iPad: andere app, Videoland).
   Instagram gestart (www.instagram.com, nooit 's nachts) zonder foto's: onzeker tonen. Bij de ontgrendel-golf (WhatsApp 07:24)
   telde ik eerder Facebook en Instagram als twee apps en www.google.com als Google; dat laatste vraagt WhatsApp zelf op.

   Nog uitzoeken: bij NPO (Zappelin) en Videoland herkent Klaro het beeld nog niet volledig: licentie- en video-adressen
   (drm.npoplayer.nl, fairplay.npo.nl, download.cdn.streamgate.nl, drm.videoland.bedrock.tech) tellen niet als beeld.
   Uitzoeken over alle dagen of die altijd en alleen bij kijken voorkomen; dan als beeld laten tellen (net als bij Netflix).
   Chip en rij: op 17 okt 08:59 (iPad) was de chip groen (spel-verkeer van Unity) terwijl er geen rij "nu" was, precies op
   het moment dat NPO begon. 1 van 434 momenten; nagaan of dit vaker gebeurt bij het wisselen van app.
   18 okt: 2 keer "chip uit, rij nu" bij Netflix op de Apple TV (17-10 20:33, 18-10 07:13): rij en chip gebruiken voor tv-apps
   een andere grens voor "nu"; uitzoeken welke klopt met de pauzes tussen Netflix-meldingen (vaak 5-6 min).
   eufy (iPhone): de app-adressen van eufylife.com komen ~3x per dag (alleen overdag) zonder eufy.com-rij. Openen van de app
   of een camerameldingsplaatje? Nagaan of het samenvalt met camera-gebeurtenissen voordat er iets verandert.
   Instagram gestart zonder foto's (onzeker): blijven meten of www.instagram.com echt nooit 's nachts komt; dan eventueel zeker.

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
