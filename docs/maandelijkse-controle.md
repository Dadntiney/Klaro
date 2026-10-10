# Maandelijkse controle

Doel van de app: alleen **echt gebruik** tonen (geen achtergrondverkeer, geen plaatjes uit mails) en een **strak vangnet**
voor 18+, dating en VPN/omzeiling, zonder vals alarm. Deze controle houdt dat scherp als er nieuwe sites, apps en mails bijkomen.

## Gegevens ophalen

```sh
curl -s -H "x-audit-token: $AUDIT_TOKEN" https://csva.vercel.app/api/audit > /tmp/audit.json
```

`AUDIT_TOKEN` staat als omgevingsvariabele in de Claude-omgeving en in Vercel. Zet hem nooit in een bestand, commit, log of bericht.
Werkt de sleutel niet (401), stop dan en meld dat de sleutel in Vercel en in de Claude-omgeving gelijk moet zijn.

## Wat je nakijkt

1. **`risky`**: adressen met een verdacht woord die níet rood zijn. Echte 18+/dating/VPN → toevoegen in `lib/sites.ts`
   (`SEXSHOP_DOMAINS`, `ADULT_PARTS`, `DATING_DOMAINS`, `DATING_PARTS`, `VPN_DOMAINS`). Onschuldig (bijv. `update`, `dns` van Apple) → laten.
2. **`flagged`**: alles wat rood is. Onterecht rood → uitzondering in `SEX_INNOCENT` of `NEVER_FLAG`. Wees streng: twijfel = rood laten.
3. **`unknownApps`**: veelgebruikte domeinen die nergens zichtbaar worden. Is het een app die mensen echt openen (zoals F1 TV)?
   → toevoegen aan `APPS` (en bij tv/streaming aan `TV_APPS`). Hulp-/reclame-/trackingdiensten → `BACKGROUND`.
4. **`mailLike`**: adressen die op nieuwsbriefverkeer lijken maar niet als mail herkend worden → mailbedrijf toevoegen aan `ESP_SUFFIX` in `lib/mail.ts`.
5. **`visible`**: zichtbare sites. Sites die duidelijk achtergrond zijn (veel korte sessies, geen echte site) → `BACKGROUND`.
   Social-apps met veel achtergrondverkeer zonder `fgApp` → regel toevoegen in `FG_RULES`.

## Regels

- Elke wijziging krijgt een test in `lib/*.test.ts` (zowel "wordt herkend" als "geen vals alarm").
- Daarna: `npm test`, `npx tsc --noEmit` en `npx next build` moeten slagen.
- Geen echte apparaatnamen of persoonsnamen in code, tests of commits.
- Committen met een duidelijke Nederlandse beschrijving en pushen naar `main` (Vercel zet het dan live).
- Niets veranderd nodig? Dan niets committen.
- Sluit af met een korte Nederlandse samenvatting: wat is toegevoegd, wat is bewust niet veranderd, en eventuele twijfelgevallen
  die de eigenaar zelf moet beoordelen.
