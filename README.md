# Klaro

Gooi het erin. Wij regelen de rest.

Klaro is een apart product. Je typt een losse gedachte, Klaro maakt er een taak of herinnering van, jij bevestigt, en het staat op Home.

## Kernflow

1. **Universal input** op Home.
2. **Lezen** — met een model als `OPENAI_API_KEY` gezet is, anders een lokale Nederlandse lezing.
3. **Bevestigen** — titel, soort en tijd aanpassen.
4. **Taak of herinnering** bewaren.
5. **Home** — open regels afvinken.

Herinneringen verschijnen op Home. Push en mail zitten niet in deze versie.

Zonder Supabase-variabelen draait `npm run dev` in demomodus: accounts blijven in `.data/` op deze machine. Een productiebuild zonder die variabelen toont de setup, en maakt geen demo-accounts.

## Stack

Next.js, TypeScript, Tailwind, shadcn/ui, Lucide, Supabase, Vercel.

## Lokaal

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase

1. Maak een project.
2. Draai `supabase/migrations/0001_init.sql` in de SQL editor.
3. Zet onder Authentication de site-URL op je app, en voeg `/auth/callback` toe als redirect.
4. Kopieer de project-URL en de anon key naar `.env.local`.

De migratie maakt `profiles`, `captures` en `items`, met RLS zodat een gebruiker alleen eigen rijen ziet. Nieuwe accounts krijgen via een trigger een profiel. Bevestigen loopt via `confirm_capture`, als de ingelogde gebruiker.

De app praat met Supabase via de anon key en de sessie van de gebruiker. De service role hoort hier niet in.

Voor lokaal proberen kun je e-mailbevestiging uitzetten onder Authentication → Providers → Email.

## Vercel

Importeer de repository, zet dezelfde omgevingsvariabelen, en deploy. Zet de variabelen vóór de build: `NEXT_PUBLIC_*` wordt dan meegenomen.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```
