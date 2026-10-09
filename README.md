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
