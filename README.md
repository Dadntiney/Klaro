# CSV (Klaro)

Upload een CSV met DNS-records (bezochte websites), ontleed die en deel de websites in blokjes in (bijv. speelgoed, games, sociale media).

- Leest de CSV in de browser; herkent automatisch de domeinkolom en eventuele aantallen.
- Groepeert per domein, telt bezoeken.
- Blokjes met eigen trefwoorden, per domein handmatig aan te passen.
- "Deel Overig in met Claude" (vereist `ANTHROPIC_API_KEY`).
- Export als CSV.

```
npm install && npm run dev
npm test
```

## NextDNS koppelen
Zet in Vercel (Settings → Environment Variables):
- `NEXTDNS_API_KEY` – API-sleutel (my.nextdns.io/account → API)
- `NEXTDNS_PROFILE_ID` – 6 tekens, tab Setup → Endpoints
- `APP_PASSWORD` – wachtwoord voor de hele site (verplicht voor NextDNS-ophalen)
- `HIDDEN_NAMES` (optioneel) – komma-gescheiden namen die uit apparaatnamen worden gehaald
