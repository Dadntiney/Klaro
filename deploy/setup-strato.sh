#!/usr/bin/env bash
# Eenmalige installatie van Klaro op een Strato VPS (Ubuntu 22.04/24.04). Uitvoeren als root:
#   curl -fsSL https://raw.githubusercontent.com/Dadntiney/Klaro/main/deploy/setup-strato.sh | bash -s -- pichya.nl
# Wat het doet: Node.js 22 en Caddy (automatisch https) installeren, gebruiker "klaro" aanmaken, Klaro als dienst
# laten draaien op poort 3000 en pichya.nl (+ www) daarnaar doorsturen. Geheimen staan NIET in dit script:
# die zet GitHub bij elke update in /opt/klaro/klaro.env (zie docs/strato.md).
set -euo pipefail
DOMAIN="${1:-pichya.nl}"

apt-get update
apt-get install -y curl ca-certificates gnupg rsync debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (webserver met automatisch https-certificaat)
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

# Gebruiker en mappen
id klaro >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/klaro --shell /bin/bash klaro
mkdir -p /opt/klaro/app /home/klaro/.ssh
touch /opt/klaro/klaro.env && chmod 600 /opt/klaro/klaro.env
chown -R klaro:klaro /opt/klaro /home/klaro
chmod 700 /home/klaro/.ssh

# GitHub mag na een update alleen de dienst herstarten
echo 'klaro ALL=(root) NOPASSWD: /bin/systemctl restart klaro' > /etc/sudoers.d/klaro && chmod 440 /etc/sudoers.d/klaro

# Klaro als dienst (start vanzelf na een herstart van de server)
cat > /etc/systemd/system/klaro.service <<UNIT
[Unit]
Description=Klaro
After=network-online.target

[Service]
User=klaro
WorkingDirectory=/opt/klaro/app
EnvironmentFile=/opt/klaro/klaro.env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable klaro

cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN, www.$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl reload caddy || systemctl restart caddy

# Firewall: alleen ssh en web
if command -v ufw >/dev/null; then ufw allow OpenSSH; ufw allow 80; ufw allow 443; ufw --force enable; fi

echo
echo "Klaar. Zet nu de publieke deploy-sleutel in /home/klaro/.ssh/authorized_keys (zie docs/strato.md)."
