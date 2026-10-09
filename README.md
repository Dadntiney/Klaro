# Bezochte websites & apps

Live overzicht van wat apparaten bezoeken, op basis van de NextDNS-logs.

- **Schone lijst**: alleen hoofdadressen en bekende apps; app-verkeer, advertenties en trackers zijn verborgen.
- **Rood**: 18+ (porno, erotische webshops) en dating, herkend op een grote lijst plus trefwoorden. Een uitroepteken bovenaan toont alles wat rood is.
- **Uitklappen**: tik op een regel voor de laatste bezoektijden en wat hetzelfde apparaat op dat moment nog meer opvroeg (ook verborgen adressen).
- **Live**: elke ~1,5 seconde nieuwe verzoeken, met een piep.
- Apparaten worden alleen als soort getoond (iPhone, iPad, MacBook), nooit met de echte naam.
- **Inzichten** (tabblad): in gewone taal of alles in orde is, hoe lang apparaten aan waren, wanneer ze uitgingen, of er iets is gekocht, of het veilig is, wat er echt is gekeken en welke apps de meeste trackers veroorzaken.

## Instellen (Vercel → Settings → Environment Variables)
| Naam | Waarde |
|---|---|
| `NEXTDNS_API_KEY` | API-sleutel (my.nextdns.io/account → API) |
| `NEXTDNS_PROFILE_ID` | 6 tekens, tab Setup → Endpoints |
| `APP_PASSWORD` | wachtwoord voor de hele site (verplicht; zonder wachtwoord worden geen logs opgehaald) |

## Ontwikkelen
```
npm install
npm run dev
npm test
```

## Gegevens
Zie `data/README.md` voor de bron en licentie van de adreslijsten.
