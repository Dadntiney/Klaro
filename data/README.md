# Gegevens

- `adult-domains.txt.gz` – samengevoegd uit (kinderen weg als het ouderdomein er al op staat):
  - "Porn Block List" van The Block List Project, MIT-licentie, https://github.com/blocklistproject/Lists
  - "NSFW" van HaGeZi DNS Blocklists, GPL-3.0, https://github.com/hagezi/dns-blocklists
  - "pornography-hosts" van Sinfonietta, MIT-licentie, https://github.com/Sinfonietta/hostfiles
  - "porn/clefspeare13" uit StevenBlack/hosts, MIT-licentie, https://github.com/StevenBlack/hosts
- `dating-domains.txt.gz` – afgeleid van de lijst "dating" van de Université Toulouse Capitole (UT1), licentie CC BY-SA 4.0, https://dsi.ut-capitole.fr/blacklists/

Bijwerken: dagelijks automatisch (`.github/workflows/update-lists.yml` → `scripts/update-lists.ts`). Alleen toevoegen, nooit
weghalen; grote platforms (google.com, tumblr.com, ...) zelf nooit, wel een 18+-blog daarop. Elke wijziging staat met datum,
bron en aantallen in `wijzigingen.md`; terugdraaien kan met `git revert` van die commit.
