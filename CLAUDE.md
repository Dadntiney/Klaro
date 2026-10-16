# Klaro — vaste projectregels

Klaro (live: https://pichya.nl op Strato-webhosting, deploy vanaf `main` via GitHub Actions + SFTP, zie `docs/strato.md`; voorheen csva.vercel.app) laat zien wat de gezinsapparaten **echt** gebruiken,
uit de DNS-logboeken van NextDNS. Schrijf met de eigenaar altijd in eenvoudig Nederlands.

## Doelen (vast, in deze volgorde bij conflicten)
1. **Niets echts missen, niets nep tonen.** Alleen echt gebruik: geen achtergrondverkeer, plaatjes uit nieuwsbrieven,
   widgets die zichzelf verversen, advertenties die een app alvast "aanklopt" of doorstuur-links.
2. **Strak vangnet** voor 18+, dating en VPN/omzeiling, zonder vals alarm. Verdachte adressen altijd tonen.
3. **Eerlijke live-status:** een chip is groen als er bewijs is van gebruik nu; anders niet. Vermoedens nooit als feit.
4. **Juiste gebruiksduur:** uit tijdstempels en sessies, niet uit het aantal DNS-regels.
5. **Zelfcontrole:** de eigenaar hoeft niets na te checken; fouten vinden en oplossen we zelf.

## Hoe het systeem werkt (niet zomaar veranderen)
- Geen eigen database: NextDNS bewaart alle logboeken; Klaro leest ze telkens opnieuw. Een storing kost dus geen data.
- Laden: eerst het laatste 1,5 uur, dan heel vandaag (`/logs`), dan alles (CSV-download, 2 min cache). Live: elke 1,5 s.
  Elke 5 min volledig opnieuw berekend. Niet vaker ophalen: NextDNS geeft dan 429.
- Herkenning: `lib/sites.ts` (apps, achtergrond, vangnet), `lib/mail.ts` (nieuwsbrieven, klikken), `lib/sessions.ts`
  (sessies, `isHuman`), `lib/play.ts` (afspeelmeldingen bij tv-apps), overzicht-regels in `lib/overview.ts`, weergave-regels in `app/page.tsx`. Dit draait allemaal in de
  browser (`lib/browser-api.ts`); de PHP-server (`php/api`) bewaart alleen de geheimen en de 18+/datinglijsten.
- Tellen in **momenten** (alles van een site binnen 1,5 s = één moment), zelfde telling live en op de server.

## Grenzen van DNS (eerlijk blijven)
- DNS ziet alleen dat een adres is opgezocht, niet wat er op het scherm staat.
- Apparaten onthouden adressen: tijdens scrollen of kijken komen er soms minuten lang geen nieuwe opvragingen.
  Gebruik dan betrouwbare app-signalen (bijv. de netwerkmeting van Facebook/Instagram, beeld/geluid-servers).
- Is iets niet zeker, toon dat als onzeker of laat het weg; nooit raden.

## Werkwijze bij elke wijziging
1. **Begrijp en meet eerst**: zoek de oorzaak in de echte gegevens (`/api/nextdns`, `/api/nextdns/detail`), niet alleen
   in het ene voorbeeld.
2. **Kleinste algemene oplossing**: geen uitzondering voor één site als een algemene regel klopt; geen werkende regel
   veranderen zonder bewijs.
3. **Doorrekenen over de hele CSV**: vergelijk vóór/na wat er bij komt en weg valt, en loop elk verschil na.
4. **Referentiegevallen**: `node --experimental-strip-types scripts/referentie.ts overzicht.json` moet volledig kloppen.
   Nieuwe gevallen die de eigenaar aanwijst komen erbij.
5. **Tests**: `npm test`, `npx tsc --noEmit`, `npx next build`; elke regel krijgt een test (herkend én geen vals alarm).
6. **Live zetten en zelf controleren** op de echte site. Pas dan melden dat het klaar is. Vercel heeft een dag-limiet:
   wijzigingen bundelen, geen halve tussenstanden melden.
7. **Kort rapporteren**: wat, waarom, wat gecontroleerd is en wat nog onzeker is.

## Vaste afspraken
- Nooit echte apparaat- of persoonsnamen in code, tests of commits. Geen geheimen in bestanden of commits.
- Dagelijkse controle: `docs/dagelijkse-controle.md` en `scripts/gemist.ts` ("mogelijk gemist").
- Altijd tonen (wens eigenaar): GoFiev, Philips Hue, eufy (`ALWAYS_SHOW` in `app/page.tsx`).
