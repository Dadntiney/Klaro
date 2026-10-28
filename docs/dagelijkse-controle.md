# Dagelijkse controle (Klaro op pichya.nl)

Doel: de eigenaar hoeft niets zelf na te checken. Elke ochtend draait een controle in een nieuwe Claude-sessie.

## Nodig in de Claude-omgeving (eenmalig, door de eigenaar)
- Netwerktoegang tot `pichya.nl`.
- Omgevingsvariabele `KLARO_PW` = het inlogwachtwoord van Klaro. Nooit in een bestand, commit, log of bericht zetten.

## Stappen
1. Overzicht ophalen, precies zoals de pagina het berekent (zelfde code, via pichya.nl/api/nd.php):

       node --experimental-strip-types scripts/overzicht.ts > /tmp/overzicht.json

1b. **Nakijken** (sinds 26 okt): bij elke regel in Klaro staat een knop "Nakijken". Open verzoeken:
       node --experimental-strip-types scripts/nakijken.ts
   Elk verzoek uitzoeken (ruwe regels rond dat moment, over alle dagen), zo nodig algemeen oplossen (doorrekenen, test,
   referentiegeval), en dan het antwoord terugzetten (komt in Klaro onder die regel te staan; kort, eenvoudig Nederlands,
   zonder geheimen):
       node --experimental-strip-types scripts/nakijken.ts --klaar ID "Klopt: ... / Klopte niet: ..., aangepast."
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
   meer zijn worden overgeslagen; wat Klaro uit de geschiedenis afleidt (widgets, vaste hulpjes) staat vast in data/geleerd.json.

   Geleerd (niet opnieuw uitzoeken): Eén los adres tijdens een social-app waarbij binnen 8 s niets van de pagina laadt
   (geen lettertype/script/teller van een ander domein) is een voorvertoning of aangeklopte advertentie: geen bezoek (22 okt, X:
   starlink/ftmo/jobescape). Laadt een pagina traag (onderdelen na 5-6 s), dan blijft het een bezoek. Piknik = kinderapp met
   Toca Boca/Sago Mini (playpiknik.com). youshouldask.ai (chatknop), hcaptcha (captcha), wepowerconnections: achtergrond. Awin (dwin1/dwin2/awin1/zenaps) is een affiliateteller in webwinkels (22 okt, "Klopt niet").
   Onderdeel dat later komt (tot 15 s na de pagina) terwijl die pagina nog volop laadt (3+ andere domeinen in de 1,5 s ervoor):
   geen bezoek (24 okt: app.varify.io, chat.stackflowaisolutions.com; over alle dagen 5 weg, niets erbij). Drempel 2 is te
   gevoelig (dan telt ook App Store-verkeer van de telefoon zelf). placehold.co (vervang-plaatjes): achtergrond.
   Vanuit een mail naar de site zelf (www.) waar meteen een hele pagina laadt (9+ andere domeinen in 3 s, geen nieuwsbrieven
   tegelijk): op een link getikt, ook als het klik-adres van het merk zelf is (www.email.happinez.nl, 24 okt 11:39). Zonder de
   uitzondering voor "Mail-app haalt nieuwsbrieven op" kwamen er 23 valse bezoeken bij. Live stond zo'n bezoek eerst 1,5 min als
   mail verborgen terwijl de chip al groen was.
   Tv: een los moment met beeldverkeer van de app (Netflix-videoservers elke 5-15 min tijdens het kijken) telt als brug of
   verlenging van echt kijken binnen 15 min, nooit als eigen regel (24 okt: Netflix middag 43 -> 106 min; over alle dagen alleen
   Apple TV-regels langer/samengevoegd, niets nieuws erbij). Spel dat die dag echt opstartte (gs): stukjes met hooguit 10 min
   ertussen zijn één keer spelen (spelmotor meldt elke 5 min; Piknik 26 -> 41 min). De chip rekent met hetzelfde geheel
   (lib/livestatus.ts), en controle.ts speelt de rijen na met lib/usage.ts, net als de pagina: chip en rij 435/435 gelijk.
   Mislukt `next build` met SecurityFatalError: Next.js bijwerken naar de herstelde versie (22 okt: 16.4.0 → 16.4.2). Filmpje (Wistia) hoort bij de pagina die het laadde; Google binnen 5 s na een andere
   pagina is een teller (20 okt, yogales). Adres dat op een apparaat telkens alleen uit mails laadt en weinig meelaadt
   (< 6 domeinen in 3 s) is een plaatje, ook vlak na zoeken (20 okt, 4kmedia-market.com, eerste "Klopt niet" van de eigenaar). Netflix op een telefoon/tablet wordt elk uur op de achtergrond wakker; zonder beeld
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
   tijdens het spelen. Klaro herkent zo'n koppeling zelf (followers() in lib/companion.ts, vastgelegd in data/geleerd.json) en telt
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
   nalopen wat nieuw geleerd is (doorrekenen over de hele CSV) en wat nog wacht; leer.ts legt het vast in data/geleerd.json.
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
   Geleerd (18 okt, bevestigd door de eigenaar terwijl hij WhatsApp gebruikte): de kale naam whatsapp.com = de app gaat open
   (ook chat.cdn → whatsapp.com → mmx-ds zonder foto's). Zonder de kale naam is het een binnenkomend bericht.
   Nog uitzoeken: x.ai vlak na het openen van de X-app (Grok in X, 2 keer in 4 weken, nu onzeker); Netflix op de tv met pauzes
   van net meer dan 15 min (16 min) blijft gesplitst. fnlcontent.nl (23 okt 07:27, één keer los, uitgever van gardenersworldmagazine.nl: doorstuur-link?); kiwi-app.nl (boekingssysteem dat streetjump.nl meelaadt, 3,4 s na de pagina, nu onzeker). braze "phillateemis" (geblokkeerd) hoort bij de Philips Hue-app; Hue-openen zonder meethue-adres wordt gemist.
   Geleerd (19 okt, 2e ronde): een spel of leer-app die volledig opstart vraagt in één moment 3+ eigen adressen op (TutoTOONS:
   apps., tutoclub., tutopulse.) en speelt daarna soms 9 min zonder verkeer. Dat telt nu als geopend (19 van 21 opstarts waren al
   zichtbaar; 2 TutoTOONS-opstarts gemist). ipapi.co / ipify.org (IP-opzoekdienst van apps) zijn achtergrond. Amaya Kids herkend.
   chatbase.co is een AI-chatknop in sites (leukerecepten.nl), geen bezoek.
   Shopify-winkels (19 okt, xellybeauty.nl): de winkel vraagt maar één eigen adres op, de rest komt van cdn.shopify.com. shop.app
   (Shop Pay-knop) en judge.me (reviews) zitten in die winkels (28 van 31 keer tegelijk) en gaven nep-rijen van 10-11 min: nu
   achtergrond. cdn.shopify.com in dezelfde seconden = winkel echt geladen, dus niet meer "onzeker" tijdens Instagram-scrollen.
   Grote controle 19 okt (avond): Prime Video op de Apple TV stond als "Amazon 2 u 8 min" plus losse Prime Video-stukjes:
   amazonvideo.com/aiv-delivery.net zijn Prime Video, en Amazon-verkeer op een tv is altijd de Prime Video-app (één rij).
   leukerecepten.nl kwam 8 keer als losse rij: Safari herlaadt het open tabblad, en mijn.leukerecepten.nl (laadt bij elke
   pagina mee sinds het inloggen) telde als "inloggen". Een inlog-adres in een los moment telt niet meer als de site die dag
   vaker dan 4 keer los laadt (zelfde regel als voor gewone pagina's). Klik in een nieuwsbrief via het eigen klik-adres van de
   winkel (url861.xenos.nl) telde als mail omdat een ander tabblad in dezelfde seconde herlaadde; nu telt de winkel met het
   eigen klik-adres, behalve als Mail veel nieuwsbrieven tegelijk opent (meer dan 3 nieuwsbrief-adressen in 3 s).
   Geleerd (20 okt): Buienradar vraagt nooit iets op de achtergrond: alle 30 keer 8-10 eigen adressen tegelijk mét
   toestemmingsscherm en advertenties = de app open. Even naar de radar kijken (1-3 s) telde niet (één moment); nu wel
   (START_BURST in lib/overview.ts, 14 opstarts over alle dagen erbij).
   Facebook-pixel-venster bewust 3 s gelaten: 5 s haalde echte Instagram-momenten weg (4 dagen).
   Brainy Trainee bewust nog als gewone naam: de app opent soms met maar één eigen adres (dan zou een app-regel het missen).
   Geleerd (26 okt): "nu" bij de rij en het groene bolletje gebruikten "de laatst begonnen app". Op de Apple TV kwamen bij het kiezen
   (beginscherm) Netflix, Max en Prime Video 1-2 min langs terwijl Disney+ nog 2 uur doorliep: bolletje groen, geen rij "nu"
   (9 keer op 25 okt). Nu: een app is pas niet meer "nu" als een later begonnen app ook minstens zo lang doorliep (superseded in
   lib/livestatus.ts), en het bolletje kiest daaruit de laatst bezig geweest app. Chip en rij: 811 van 812 momenten gelijk (48 uur);
   het ene verschil valt midden in het zappen (19:31).
   Geleerd (25 okt, controle op verzoek): nieuw kinderspel My Little Princess op de iPad (sinds 19 okt). Start met r2.my-little-princess.net
   en de Unity-motor in dezelfde seconde, daarna toca010-r2.; tijdens het spelen meldt Unity zich elke 5 min. Klaro kende het niet,
   dus 13 speelbeurten in 5 dagen ontbraken (25 okt 06:23 34 min, 08:38 24 min). Nu een eigen app. Daarbij: de spel-motor die in
   hetzelfde moment (1,5 s) vlak vóór het eigen adres van een spel opstart, hoort bij dat spel (assignGameSdk); anders telde de
   opstart niet en viel het spelen in stukjes van 5 min. Over alle dagen: alleen deze speelbeurten erbij, BoBo World-start niet meer
   als staartje van TutoTOONS (18 okt), en twee keer TutoTOONS 0 min (alleen even geopend; het spelen daarna was My Little Princess).
   Nagelopen en goed: Buienalarm en Buienradar tegelijk (beide echt geopend), blakelyclothing.com (Google-resultaat, hele winkel geladen).
   Geleerd (19 okt): nieuw kinderspel BoBo World op de iPad (18 okt uit de App Store gehaald). Het start met svip.bobo-world.com,
   www.bobo-world.com en www.kalegames.com tegelijk en meldt tijdens het spelen elke ~4 min cp.papoworld.com. Zelf leren zag die
   drie adressen als "vast hulpje" en verborg het spel (stond als "Spel (naam onbekend)" of TutoTOONS). Nu een eigen app.
   Geleerd (18 okt, idee eigenaar): WhatsApp-reeks die met g.whatsapp.net begint en zonder de kale naam whatsapp.com is een
   binnenkomend bericht (met foto: static. + media. tegelijk), geen openen. Openen heeft altijd whatsapp.com.
   Geleerd (18 okt): sites die zichzelf verversen (onsoranje26.nl + voetbalkrant.com) leken een getikt zoekresultaat als de
   verversing vlak na een zoekopdracht viel; met alleen de kale naam/www. is het nu een verversing. Meditopia is een app
   (controle 5b vond hem), maar start telkens alleen 5-6 s als eerste bij het ontgrendelen: onzeker (eigenaar twijfelt). Het rijtje sites op alfabet in een paar seconden (07:20) is de wachtwoorden-lijst die logo's ophaalt.
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

   Nog uitzoeken (26 okt, middag, vraag eigenaar "gaat dit goed?"): Google-tijd telt alleen www.google.nl e.d. als "inhoud", niet
   www.google.com. Websites vragen zelf vaak www.google.nl op (meetcode): 26 okt 13:03 only.com, 4 s na het laden; daardoor bleef
   Google 10 min "nu". Omgekeerd telt een echte zoekopdracht met resultaat-plaatjes (www.google.com + t0-t3.gstatic.com, 5 okt
   08:08) niet mee. Uitgeprobeerd: kale www.google.* alleen als zoeken bij een zoekpagina-onderdeel binnen 3 s, of zonder dat maar
   niet binnen 5 s na een andere website: Google-minuten 884 -> 926 over alle dagen, maar 2 referentiegevallen vielen om
   (getdrezzed.nl "geopend vanuit Google", blakelyclothing.com 26 okt) omdat "geopend vanuit Google" de Google-rij gebruikt. Eerst die
   koppeling uitzoeken, dan pas invoeren. Ook: asosglobal.com laadt in dezelfde seconde als asos.com (eigen domein van het merk) en
   stond als aparte "Nieuw"-rij; nagaan of "merk + achtervoegsel" (asosglobal, asosservices) algemeen bij het merk hoort.
   Nog uitzoeken (26 okt): zelf leren koppelde a1556.dscapi9.akamai.net aan Buienradar, maar dat adres komt maar 44 van de 94 keer
   binnen een minuut bij Buienradar voor (ook bij Apple-verkeer). De leerregel kijkt alleen naar samen voorkomen met apps, niet
   met al het andere verkeer. Nagaan of een strengere regel (meestal bij de app) over alle dagen niets echts weghaalt.
   Geleerd (26 okt, hele dag): cloudflare.com (cp4, apple-relay, radar, www.) is netwerk en meting die winkels en iCloud
   meeladen, geen bezoek (stond in de systeemlijst, maar als "eigen" adres werd het toch een rij); sovendus(-connect) is een
   kortingsbon-widget na het afrekenen, redbrain.shop een doorstuur-link van een prijsvergelijker, pubmetric.com een
   advertentieteller, closersuite.io een script bij een webinarpagina. Alle vijf naar de achtergrondlijst: 14 rijen weg, verder
   niets veranderd over alle dagen; de echte site op die momenten blijft staan. warp.cloudflare.com blijft VPN (die regel gaat voor).
   Nog uitzoeken (26 okt): een winkel die op één dag vaker dan 4 keer los opduikt telt als open tabblad/widget, ook als de hele
   pagina laadt (blakelyclothing.com 06:56 en 12:31; 12:51 blijft wel staan). Uitgeprobeerd: alleen "kale" momenten tellen (74
   rijen erbij, 2 referentiegevallen om: dewerkendewebsite.nl, leukerecepten.nl) en winkel-onderdelen niet meetellen (8 losse
   partywinkel.nl-rijen erbij). Beide teruggezet. Nodig: een kenmerk dat een herladend tabblad onderscheidt van opnieuw kijken.
   Geleerd (26 okt, Nakijken): de PayPal-knop in een webwinkel vraagt www.paypal.com en paypalobjects op, soms in twee momenten.
   Echt betalen laadt het inlogscherm (c./pics./t./ddbm2.paypal.com; alle 4 echte betalingen in okt). Alleen knop-adressen binnen
   3 s na een andere pagina die nog laadt = knop, geen bezoek (PAY_BUTTON in lib/overview.ts): over alle dagen 1 rij weg (16:08).
   Een algemene regel (elk www.-adres zo vlak na een pagina) was te breed: 13 rijen anders en een referentiegeval om.
   lprastudio.net = LPRA Studio, maker van kinderspellen met Google-reclame (app. + www. met app-measurement en googleads): nu
   "LPRA Studio (spel)". Een los moment zonder opstarten (18:34) blijft weg, zoals bij elke app.
   Geleerd (26 okt, Nakijken 2e keer): de LPRA-rij liep 15:51-16:04, maar het spel lag 15:54-16:04 stil (geen enkele melding;
   de iPad ververste widgets op de achtergrond). Spellen melden zich tijdens het spelen elke 5,0 min (bijna alle gaten, hooguit
   6,8); stukjes worden nu alleen samengevoegd bij hooguit 7 min ertussen (GAME_GAP, ook voor het groene bolletje). Over alle dagen
   3 rijen korter: LPRA 13 -> 3 min, My Little Princess 23 okt 17 -> 8 min, TutoTOONS 19 okt 20 min -> 08:04 kort + 08:13 11 min
   (daar was het eerder "9 min stil spelen" genoemd; die 9 min waren helemaal zonder verkeer, dus niet aantoonbaar gespeeld).
   Geleerd (26 okt, Nakijken): 4kmedia-market.com (plaatje uit spam, 7 keer sinds 1 okt, altijd met mailplaatjes) stond toch als
   rij: er werd op dat moment gezocht, en "zoeken, dan de site" telde als een geklikt zoekresultaat. Nu niet als er in dezelfde
   seconden (5 s ervoor tot 3 s erna) een mail-adres van een ánder merk laadt (subscriptions.indeed.com, email.mail.merk.nl):
   dan haalt de Mail-app mails op. Code van een mailbedrijf zelf (Copernica, Klaviyo) telt niet: die laden winkels ook op hun
   pagina. Uitgeprobeerd en te breed: elk mailbedrijf (14 rijen weg, 2 referentiegevallen om) en 2+ mailbedrijven (shoesme.nl
   weg). Over alle dagen: 4kmedia 2x weg, lijstje.nl 11 okt 17:09 weg (tabbladen herladen + mails van Indeed/Pinterest),
   allcamps.nl 22 okt 09:44 nu onzeker (tijdens Facebook; stond eerst verborgen als "onderdeel" door toeval met lijstje.nl).
   Geleerd (27 okt, ochtend): de chip voegde alleen stukjes van spellen samen, de lijst ook die van navigatie en van apps met een
   vaste melding (NPO, Toca Boca). Daardoor zei de chip 26 okt 16:20-19:00 op de iPad "uit" en de NPO-rij "nu". Nu dezelfde regel
   (deviceUse krijgt de followers). Vast raster elke 5 min over 26 okt: 8 -> 5 verschillen, niets nieuws erbij.
   Nog uitzoeken (27 okt): resterende verschillen chip/rij zijn randen bij starten en stoppen: Google op de iPhone (13:30, 14:00),
   het laatste moment van een spel vlak voor het volgende spel (18:10), en een tv-app die net begint (Ziggo GO 18:55 en 00:05:
   chip al groen, de rij nog niet).
   Geleerd (27 okt, Melden): launchdarkly.com (instellingen-dienst die raisin.com meelaadt) is achtergrond. Daarbij viel op dat
   referentiegeval trivago.nl 11 okt 17:09 (tabbladen herladen) niet meer klopte: de oudste dag viel uit het logboek, en de
   meeste herladen tabbladen tellen als mail (tegelijk Indeed/Pinterest-mail), waardoor de regel "4+ sites in 20 s" ze niet zag.
   Nu tellen mail-pagina's mee als tabblad; komt de vier alleen zo vol, dan telt de zoekmachine niet mee (7 okt ggdhvb.nl/ncj.nl
   na zoeken blijven) en blijft een site die 2+ eigen pagina's laadde staan (24 okt cottonclub.nl via de nieuwsbrief). Over alle
   dagen: 4 rijen weg (nbo.nl, trivago.nl, kidsvoeding.nl, fashionmusthaves.be), alle vier tegelijk met een reeks mails.
   Geleerd (28 okt, wens eigenaar "te veel onzeker, live beter controleren"): onzeker van 197 naar 30 regels (30 dagen), geen
   regel erbij of weg. (1) www.instagram.com = Instagram geopend: 166 keer, nooit 22-07 uur, terwijl de app 's nachts wel ververst
   (test-gateway/i. om 1-4 uur); geen foto's = 0 min, niet onzeker. (2) Website tijdens een social-app: een teller die pas draait
   als de pagina echt open staat (PAGE_BEACON: region1.google-analytics, stats.g.doubleclick, ct.pinterest, x.clarity.ms) binnen
   15 s = getoond (58 van 101). Geen teller zegt niets (telefoon onthoudt adressen: ook bij echte bezoeken maar ~50%). (3) Een
   advertentie laadt tijdens het scrollen: alleen onzeker als er binnen 15 s tijdlijn-inhoud laadde (bekende X-advertenties 0-7 s;
   pakketdiensten, ouderportaal, winkels 18-180 s van het scrollen = gewoon bezoek). Over: X-advertenties, Meditopia-opstart.
   Live vanaf nu: deze regels draaien in de browser bij elke berekening; de taak van elke 5 minuten (scripts/waarschuw.ts) laat de
   server nieuwe adressen met een eigen pagina meteen nakijken (websitecontrole, hooguit 4 per keer).
   Geleerd (28 okt, middag, schermafbeelding eigenaar "Google 27 min"): de Google-app ververst op de achtergrond (meldingen,
   Foto's, account: GOOGLE_APP_BG) en vraagt daarbij www.google.com op in dezelfde seconde. Zonder zoekbalk/plaatjes binnen 10 s
   telt dat niet als zoeken; dl.google.com (downloads/updates) is achtergrond. Andersom: Google-balk + plaatjes van resultaten
   is altijd een zoekpagina (x.zp), ook als www.google.* niet opnieuw opgevraagd werd (telefoon onthoudt het adres). Let op:
   google.com staat per apparaat op de lijst "ververst zichzelf" (losse www.google van apps), die haalt pv weg; daarom een eigen
   merkje. Over de hele CSV: 2 Google-regels korter (27->11, 9->3 min), 6 echte zoekopdrachten erbij, niets anders.
   Algemene les: een groot merk (Google) heeft adressen van drie soorten in één groep: de pagina zelf, meetcode die andere sites
   meeladen (analytics, www.google als tracker) en de eigen app op de achtergrond. Alleen de pagina telt als gebruik; de rest mag
   een sessie nooit verlengen. Bij een "te lange" rij eerst kijken welk adres het gat overbrugt.
   Geleerd (28 okt, alle 1.746 domeinen van 32 dagen één voor één nagelopen: getoond / nooit getoond / achtergrond / onderdeel):
   - Betaalverzoek geopend (betaalverzoek.knab.nl, link uit WhatsApp) = bezoek + betaalmoment (PORTAL "betaalverzoek", payKind).
   - Picnic-app (storefront-/pages-prod.nl.picnicinternational.com) en Outlook in de browser (outlook.live.com, www.hotmail.com;
     MacBook, 7 keer) zijn apps; eas.outlook.com (sync van de Mail-app) en click.picnic.nl (nieuwsbrief) blijven buiten.
   - ouderportaal.nl is een platform: elke opvang een eigen site (zoals naam.wordpress.com, HOSTED in lib/parse.ts). Nu 8 keer
     getoond (3 onzeker: tijdens scrollen); keren vlak bij binnenkomende mail blijven verborgen (mailregel).
   - Korte links bij het merk (amzn.eu, pin.it), mediawiki.org bij Wikipedia; achtergrond: cleansizecharts (maattabel),
     phoenixsite (websitebouwer), myqrcode.mobi (QR-doorstuur), neoseum-widget.
   - Nagelopen en goed: alle "nooit getoond"-sites met een eigen pagina laden midden in mail-reeksen (nieuwsbrief- en spamplaatjes,
     ook casino-links); ftmo/starlink in X staan al als onzeker (reclame); yahoo = Aandelen-widget; streamgate = beeld van Pathé.
   Opgelost met de websitecontrole (scripts/sitecheck.ts): fnlcontent.nl stuurt door naar uitgever FNL Media = achtergrond;
   dinohero.com geeft 404 (spelserver, terecht verborgen). Nog uitzoeken: een site die een dag
   vaker dan 4 keer los opduikt verdwijnt helemaal, ook het eerste (gezochte) bezoek (12 okt vacaturesite) - "vlak na zoeken"
   als uitzondering geprobeerd, maar www.google zit ook als meetcode in sites: te onbetrouwbaar.
   Geleerd (28 okt, middag): de ChatGPT-teller (bzr./bzrcdn.openai.com) zit in webwinkels (bever.nl) en in de ChatGPT-app zelf
   (winkelkaartjes in een chat). Binnen 3 s van een webpagina hoort hij bij die pagina; anders blijft hij een teken van gebruik.
   Over de hele CSV: 11 ChatGPT-regels weg die alleen uit die teller bestonden (bv. 26 okt 15:01, 16:04), en het begin klopt nu
   (27 okt "12:05" -> 12:07, toen de app echt openging). Geldt voor alle APP_TRACKERS (ook X/Reddit), alleen ChatGPT veranderde.
   Geleerd (28 okt, melding eigenaar): Ezoic (ezojs.com, ezodn.com, ezoic.net) is het advertentiesysteem van blogs: achtergrond.
   Geleerd (28 okt, middag): shopify.com (cdn., pay., checkout.), shopifycdn.com en shopifyapps.com zijn het platform onder een
   webwinkel, geen bezoek: nu achtergrond (zoals shopifycloud/shopifysvc al waren). Over de hele CSV: 10 regels "shopify.com" weg
   (bijna altijd in dezelfde seconde als partywinkel.nl, laraboutique.nl e.d.); 27 okt 08:14 staan bever.nl en laraboutique.nl er
   nu wel; 27 okt 16:44 decathlon.nl valt weg (Safari herlaadde 3 tabbladen binnen 4 s na ontgrendelen).
   Nog uitzoeken (28 okt): www.google.* in dezelfde seconden als de tellers van een andere site (27 okt 08:14:30, 2 s na bever.nl)
   is advertentiecode, maar plakt aan een echte zoekopdracht 3 min later ("Google 3 min"). Regel "0-3 s na een andere pagina en
   geen zoekbalk/plaatjes" geprobeerd: te breed (haalde ook zoek-kliks weg: happinez, aboutyou, coolblue). Meer gevallen verzamelen.
   Geleerd (28 okt, middag): Google Analytics (region1.analytics.google.com) valt onder google.com, maar elke webwinkel laadt het
   mee (elke 1-3 min). Het hield de Google-regel open tijdens winkelen/afrekenen (28 okt: 28 min Google, echt gezocht om 09:14,
   09:28 en 09:36). Nu telt zo'n melding alleen binnen 60 s van een Google-pagina zelf (www.google.*). En een Google-sessie met
   zoekplaatjes (encrypted-tbn) is nooit een mail-plaatje. Over de hele CSV: 38 regels anders, allemaal Google korter of
   gesplitst; losse www.google-momenten zonder zoekbalk/plaatjes vallen weg (geen zoekpagina); geen andere site weg.
   Geleerd (28 okt, middag): onderdelen van WordPress-sites (jetpack./public-api./r-login./files.wordpress.com, *.wp.com) en
   blog-widgets (pzz.to/.io/.events, zelfde seconde als de blog) zijn achtergrond, geen bezoek. Een blog zelf (naam.wordpress.com)
   blijft zichtbaar. Over de hele CSV: alleen 2 rijen weg (28 okt), de echte blog kwam ervoor in de plaats.
   Geleerd (28 okt, ochtend): eufylife.com (security-app-eu., care-app-eu., security-mqtt-eu.) is dezelfde eufy-camera-app als
   eufy.com (89 van 108 keer samen, 39 keer bij het openen): samengevoegd. Eufy blijft alleen zichtbaar als de app echt opengaat;
   over alle dagen alleen 22 okt een minuut eerder begonnen. TikTok/Pinterest "mogelijk gemist" waren weer alleen de geblokkeerde
   tellers op websites.
   Ook (28 okt): zelf leren wilde tui.nl vastleggen als "hulpje" (dan zouden echte bezoeken verdwijnen). Oorzaak: elke keer laadde
   vlak ervoor imgcy.trivago.com (eerst op trivago vergeleken, dan doorgeklikt) en mwa.tui.com (eigen merk, andere extensie). Nu
   telt een onderdeel van hetzelfde merk of van een site die je net zelf open had niet als hulpadres. Hulpjes blijven verder gelijk.
   Nieuw (28 okt, wens eigenaar): bij een regel buiten het thuisnetwerk staat "mobiel internet", "andere wifi" of "niet thuis".
   Uit het internetadres van die periode (lib/network.ts, runs[].ip) en het RIPE-register (api/netinfo.php, 30 dagen bewaard;
   IPv6 alleen het netwerkdeel). Gemeten: thuis Ziggo; alleen-iPhone-adressen Vodafone "Mobile Office Service" (mobiel); een
   Odido "Pool for fixed WBA users" (vast = andere wifi). 4G of 5G is niet te zien; geen trefwoord = "niet thuis" (nooit raden).
   Geleerd (28 okt): de iPhone stuurt ook thuis een deel via mobiel internet (Vodafone-adres een week hetzelfde, binnen seconden
   naast de Ziggo-wifi). Daardoor gold dat mobiele adres als "thuis" en ontbraken echte mobiele periodes. Nu per moment: thuis als
   het apparaat binnen 5 min ook via de thuis-wifi (IPv6) ging, of een IPv4-adres dat 2+ apparaten thuis gebruiken. Een periode
   splitst als het netwerk echt wisselt (3 opvragingen op rij). Gemeten: iPad en Apple TV nooit weg; MacBook alleen 27 okt
   (Odido); iPhone mobiel op veel dagen, 27 okt 18:48 mobiel, 19:11-21:47 Odido-wifi, daarna weer mobiel. Filter "buiten de
   deur" (speldje) toont alleen die regels.
   Nieuw (28 okt, wens eigenaar): (1) eigen naam voor een netwerk (details van een regel: "Naam geven"; api/netnames.php);
   (2) hotspot: laptop/tablet buiten de deur op hetzelfde mobiele adres als een telefoon (binnen 2 min) = "hotspot iPhone";
   (3) land van het adres (RIPEstat geolocatie) als het niet NL is: " · Duitsland" (let op: mobiel roamen in de EU gaat vaak
   via Nederland, dan is het buitenland niet te zien); (4) melding "nieuw apparaat" als NextDNS een apparaat de laatste 30 min
   voor het eerst zag (scripts/waarschuw.ts newDeviceAlerts); (5) per apparaat van wanneer tot wanneer echt gebruikt, bij elke
   dag onder de minuten; na 23:00 of voor 06:00 in oranje.
   Nog uitzoeken (25 okt): een los moment met alleen www.paypal.com (geen paypalobjects/c.paypal, niets anders geladen) vlak nadat Mail
   ophaalt is waarschijnlijk een geopende PayPal-mail (echte PayPal-pagina laadt altijd 20+ adressen). Maar zulke "lege" momenten
   komen over alle dagen niet vaker voor bij mail (5 van 31) dan toeval (35%), en een kleine site na zoeken ziet er net zo uit. Nog geen
   zekere algemene regel; blijven verzamelen.
   Nog uitzoeken: bij NPO (Zappelin) en Videoland herkent Klaro het beeld nog niet volledig: licentie- en video-adressen
   (drm.npoplayer.nl, fairplay.npo.nl, download.cdn.streamgate.nl, drm.videoland.bedrock.tech) tellen niet als beeld.
   Uitzoeken over alle dagen of die altijd en alleen bij kijken voorkomen; dan als beeld laten tellen (net als bij Netflix).
   Chip en rij: op 17 okt 08:59 (iPad) was de chip groen (spel-verkeer van Unity) terwijl er geen rij "nu" was, precies op
   het moment dat NPO begon. 1 van 434 momenten; nagaan of dit vaker gebeurt bij het wisselen van app.
   18 okt: 2 keer "chip uit, rij nu" bij Netflix op de Apple TV (17-10 20:33, 18-10 07:13): rij en chip gebruiken voor tv-apps
   een andere grens voor "nu"; uitzoeken welke klopt met de pauzes tussen Netflix-meldingen (vaak 5-6 min).
   19 okt gemeten (alle dagen, Apple TV): pauzes tussen Netflix-adressen onder 15 min: 897 korter dan 3 min, 280 van 3-6 min,
   35 van 6-8 min, 70 van 8-15 min. De twee gevallen (18-10 16:00 en 19:30) vielen in pauzes van 9 en 7 min. Nog geen zekere grens.
   19 okt 08:36 (iPad): chip groen, geen rij "nu": NPO en Toca Boca startten in dezelfde seconden; de rij kiest de laatst
   gestarte app (Toca Boca, 7 s), de chip ziet NPO. Uitzoeken of zo'n gelijktijdige Toca Boca-melding bij het wisselen hoort.
   19 okt 10:56 (iPhone): xellybeauty.nl (afrekenpagina) en aboutyou.nl laden 3 s na elkaar, net na een Google-opvraging. Tabbladen
   die Safari opnieuw laadt, of echt? Drempel "tabbladen opnieuw geladen" naar 3 sites haalde 14 waarschijnlijk echte rijen weg;
   daarom nu getoond. Meer van zulke paren verzamelen.
   Ouderportaal kinderopvang (iPhone, korein.ouderportaal.nl + frontend…ouderportaal.nl): 4 keer in 24 dagen, één keer met de
   push-registratie van de app (20 okt 07:38, daarna iDEAL-betaling), één keer in een herlaad-golf van Safari. Te weinig bewijs.
   eufy (iPhone): de app-adressen van eufylife.com komen ~3x per dag (alleen overdag) zonder eufy.com-rij. Openen van de app
   of een camerameldingsplaatje? Nagaan of het samenvalt met camera-gebeurtenissen voordat er iets verandert.
   Instagram gestart zonder foto's (onzeker): blijven meten of www.instagram.com echt nooit 's nachts komt; dan eventueel zeker.

4b. Websitecontrole (sinds 28 okt): de server haalt de voorpagina op (scripts/sitecheck.ts adres1 adres2; api/sitecheck.php).
   Uitkomst: website / doorsturen / leeg / techniek / geen pagina / afgeschermd (weert robots: onbekend) / onbereikbaar.
   - Live: een NIEUWE site waar geen echte website staat (techniek, geen pagina, leeg) krijgt "onzeker" (nooit verborgen).
   - Dagelijks: scripts/controle.ts toont alle nieuwe adressen van de laatste 24 uur met hun oordeel; ⚠ = nalopen (getoond
     zonder echte website, of een echte website met eigen pagina die niet getoond wordt).
   Alleen een aanwijzing naast de ruwe regels (ook advertentiebedrijven hebben een site); 18+/dating wordt nooit opgehaald.
   Geleerd (28 okt): veel echte sites weren robots (403/503: deviantart, coloriage.info) = afgeschermd, niet "geen pagina".
   Geleerd (28 okt): een blog met een lijst links laat de browser die adressen vooruit opzoeken (10 blogs in dezelfde seconde,
   waaronder een verlopen blognaam die nu naar een gok-site doorstuurt): niet geopend, terecht niet getoond.
5. Echte gaten algemeen oplossen (APPS, BACKGROUND, regels), altijd eerst doorgerekend over de hele CSV (vóór/na vergelijken,
   elk verschil nalopen), met tests (herkend én geen vals alarm) en een referentiegeval.
6. Geleerde kennis vastleggen (blijft ook als het NextDNS-logboek wordt leeggemaakt):

       node --experimental-strip-types scripts/leer.ts /tmp/overzicht.json

   Dat vult data/geleerd.json aan (widgets/open tabbladen en vaste hulpjes, met datum "laatst gezien"; geldt 90 dagen na de laatste
   bevestiging). Is het bestand veranderd: meenemen in de commit.
7. `npm test`, `npx tsc --noEmit`, `npx next build` moeten slagen. Dan naar `main`: GitHub zet het via SFTP live en
   controleert pichya.nl. Daarna stap 1, 2 en 4 opnieuw.
7b. Waarschuwen nakijken (pushmeldingen, zie docs/strato.md): draait de GitHub-taak "Waarschuwen" elke ~5 min en slaagt hij?
   (GitHub: actions_list voor waarschuw.yml; of `api/push.php` → `laatst`, moet minder dan een uur oud zijn.) Mislukt hij: de
   oorzaak zoeken en oplossen (server, sleutel, NextDNS), net als elke andere fout. Deze dagelijkse commit houdt de taak ook in
   leven: GitHub zet geplande taken uit na 60 dagen zonder commits.
8. `docs/laatste-controle.md` bijwerken (datum van vandaag + één regel resultaat, zonder site- of apparaatnamen: de repository is openbaar) en meenemen in de laatste commit van de dag,
   ook als er niets veranderd is. Daaraan ziet de bewaking (`.github/workflows/leren.yml`) dat de controle gedraaid heeft.
9. Kort melden in eenvoudig Nederlands wat er is opgelost; niets gevonden = één zin.
