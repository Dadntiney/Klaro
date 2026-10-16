# Klaro op Strato (pichya.nl)

Klaro draait op een eigen Strato-server (VPS) in plaats van Vercel. Elke wijziging op `main` gaat er automatisch heen
(GitHub Actions: "Live zetten op Strato"). Wachtwoorden en sleutels staan alleen in GitHub-geheimen en op de server,
nooit in de code of in een chat.

## Eenmalig instellen (eigenaar, ±20 minuten)

1. **VPS bij Strato.** Een gewoon webhostingpakket (alleen PHP) werkt niet. Bestel de kleinste *Linux VPS* met
   **Ubuntu 24.04** en noteer het **IP-adres** en het root-wachtwoord dat Strato geeft.
2. **Domein naar de server.** In Strato bij *Domeinen → pichya.nl → DNS-instellingen*: zet het **A-record** van
   `pichya.nl` én `www.pichya.nl` op het IP-adres van de VPS. (Het kan tot een uur duren voor dit overal werkt.)
3. **Installatie op de server.** Log in op de VPS (in Strato via de webconsole, of met `ssh root@IP-ADRES`) en plak:

       curl -fsSL https://raw.githubusercontent.com/Dadntiney/Klaro/main/deploy/setup-strato.sh | bash -s -- pichya.nl

4. **Sleutel voor automatisch live zetten.** Plak op de server, regel voor regel:

       ssh-keygen -t ed25519 -f /root/klaro-deploy -N "" -C klaro-deploy
       cat /root/klaro-deploy.pub >> /home/klaro/.ssh/authorized_keys
       chown klaro:klaro /home/klaro/.ssh/authorized_keys && chmod 600 /home/klaro/.ssh/authorized_keys
       cat /root/klaro-deploy

   Kopieer wat het laatste commando toont (van `-----BEGIN` t/m `END ... KEY-----`). Daarna: `rm /root/klaro-deploy`.
5. **Geheimen in GitHub.** Op github.com → *Dadntiney/Klaro → Settings → Secrets and variables → Actions →
   New repository secret*, vijf keer:

   | Naam | Waarde |
   |---|---|
   | `STRATO_HOST` | het IP-adres van de VPS |
   | `STRATO_SSH_KEY` | de sleutel uit stap 4 |
   | `NEXTDNS_API_KEY` | API-sleutel uit NextDNS (*Account → API*) |
   | `NEXTDNS_PROFILE_ID` | de profiel-ID (staat in het adres van my.nextdns.io, bijv. `abc123`) |
   | `APP_PASSWORD` | het inlogwachtwoord voor Klaro (kies een nieuw, sterk wachtwoord) |

6. **Starten.** GitHub → *Actions → Live zetten op Strato → Run workflow*. Na ±3 minuten werkt https://pichya.nl.

## Daarna
- Elke wijziging op `main` gaat vanzelf live; de laatste stap controleert dat pichya.nl reageert.
- Server herstart? Klaro start vanzelf weer op. Https-certificaat wordt automatisch verlengd (Caddy).
- Logboek van de server: `journalctl -u klaro -n 100` (als root op de VPS).
