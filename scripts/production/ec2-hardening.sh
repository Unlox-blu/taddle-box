#!/usr/bin/env bash
#
# EC2 production hardening for the Taddle backend.
#
# Sets up, on the server itself:
#   1. Let's Encrypt certificate for server.taddlebox.com + auto-renewal
#      (systemd certbot.timer, with an nginx-reload deploy hook).
#   2. nginx log rotation (daily, 14 days, compressed).
#   3. fail2ban (sshd + nginx auth/botscan jails).
#
# Prerequisites (do these first, then run this script):
#   - nginx is installed and /etc/nginx/conf.d/server.conf (see nginx/nginx.conf)
#     is in place with the HTTP → HTTPS redirect for server.taddlebox.com.
#   - AWS security group allows TCP 80 and 443 inbound from the internet.
#     Port 1999 (the Node app) must stay CLOSED — nginx is the only entry point.
#
# Usage (run as root on the EC2 instance):
#   sudo bash scripts/production/ec2-hardening.sh
#
# Idempotent: safe to re-run; it skips steps that are already done.
set -euo pipefail

DOMAIN="server.taddlebox.com"
# Let's Encrypt emails you here when the cert is expiring soon / fails to renew.
# Set a real address before first run.
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@example.com}"

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run with sudo: sudo bash scripts/production/ec2-hardening.sh" >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx is not installed. Install it and place /etc/nginx/conf.d/server.conf first." >&2
  exit 1
fi

# ── 1. Let's Encrypt + auto-renewal ────────────────────────────────────────
say "1/3  Let's Encrypt"
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y certbot python3-certbot-nginx
fi

if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  say "Certificate for ${DOMAIN} already exists — skipping issuance."
else
  certbot certonly --nginx -d "${DOMAIN}" \
    --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" \
    --keep-until-expiring
fi

# Reload nginx after every successful renewal (not just certificate issuance).
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh <<'EOF'
#!/bin/sh
nginx -t && systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh

# Auto-renewal: modern Ubuntu ships a systemd timer; older ones use cron.
if systemctl list-unit-files certbot.timer >/dev/null 2>&1; then
  systemctl enable --now certbot.timer
else
  cat > /etc/cron.d/certbot <<'EOF'
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 3 * * * root certbot renew --quiet --deploy-hook 'nginx -t && systemctl reload nginx'
EOF
  chmod 644 /etc/cron.d/certbot
fi

# ── 2. nginx log rotation ──────────────────────────────────────────────────
say "2/3  nginx log rotation"
cat > /etc/logrotate.d/nginx <<'EOF'
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 $(cat /var/run/nginx.pid)
        fi
    endscript
}
EOF

# ── 3. fail2ban ────────────────────────────────────────────────────────────
say "3/3  fail2ban"
if ! command -v fail2ban-server >/dev/null 2>&1; then
  apt-get install -y fail2ban
fi

cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

# SSH brute force.
[sshd]
enabled = true

# API basic-auth brute force (if any) — reads the nginx error log.
[nginx-http-auth]
enabled = true
logpath  = /var/log/nginx/error.log

# Generic bot scanning (404/400 floods) — reads the nginx access log.
[nginx-botsearch]
enabled = true
logpath  = /var/log/nginx/access.log
EOF

systemctl enable --now fail2ban
fail2ban-client reload

# ── Verification ───────────────────────────────────────────────────────────
say "Verification"
nginx -t && systemctl reload nginx
systemctl list-timers certbot.timer --no-pager 2>/dev/null || true
fail2ban-client status
fail2ban-client status sshd 2>/dev/null || true

say "Done. Final reminders:"
echo "  - Security group must allow only 80/443 from the internet; 1999 stays closed."
echo "  - Check the cert is live:        curl -sI https://${DOMAIN}"
echo "  - Socket.io handshake:           curl -s 'https://${DOMAIN}/socket.io/?EIO=4&transport=polling'"
echo "  - If CERTBOT_EMAIL is still admin@example.com, re-run with:"
echo "      sudo CERTBOT_EMAIL=you@example.com bash scripts/production/ec2-hardening.sh"
