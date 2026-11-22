#!/usr/bin/env bash
# One-time setup of the capture app on an Ubuntu 24.04 server that may already host other sites.
# Run as root:  DOMAIN=amcgh.iftikharahmed.site bash server-setup.sh
# Safe to run again. It adds, and never edits: other nginx sites, MySQL and PHP are left alone.
set -euo pipefail

DOMAIN="${DOMAIN:?set DOMAIN, e.g. DOMAIN=amcgh.iftikharahmed.site}"
APP_DIR=/srv/capture
PORT=8100

echo "== packages"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib >/dev/null
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
fi

echo "== a small PostgreSQL: this server has 1 GB of memory and other sites"
PGCONF=$(ls -d /etc/postgresql/*/main | tail -1)/conf.d
cat > "$PGCONF/capture-small.conf" <<'EOF'
shared_buffers = 64MB
work_mem = 4MB
maintenance_work_mem = 32MB
max_connections = 30
listen_addresses = 'localhost'
EOF
systemctl restart postgresql

echo "== app user, folders, database"
id capture >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin capture
mkdir -p "$APP_DIR"/{releases,storage,web} /var/backups/capture /etc/capture
chown -R capture:capture "$APP_DIR" /var/backups/capture
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='capture'" | grep -q 1 || sudo -u postgres createuser capture
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='capture'" | grep -q 1 || sudo -u postgres createdb -O capture capture

echo "== settings (secrets stay on the server)"
if [ ! -f /etc/capture/capture.env ]; then
  cat > /etc/capture/capture.env <<EOF
CAPTURE_DATABASE_URL=postgresql+psycopg://capture@/capture?host=/var/run/postgresql
CAPTURE_STORAGE_DIR=$APP_DIR/storage
CAPTURE_COOKIE_SECURE=true
# Photo reading (OCR) is off: this server has 1 GB of memory. Photos are kept; forms are filled by hand.
CAPTURE_EXTRACTION_ENABLED=false
# The stand-in hospital until AMCGH IT gives the real API (then: http, URL and token).
CAPTURE_HOSPITAL=stub
UV_PYTHON_PREFERENCE=only-system
UV_CACHE_DIR=$APP_DIR/.uv-cache
EOF
fi
chmod 640 /etc/capture/capture.env
chown root:capture /etc/capture/capture.env

echo "== the app as a service, capped so it can never starve the other sites"
cat > /etc/systemd/system/capture-api.service <<EOF
[Unit]
Description=AMCGH capture app (API)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=capture
Group=capture
WorkingDirectory=$APP_DIR/current/server
EnvironmentFile=/etc/capture/capture.env
ExecStart=$APP_DIR/current/server/.venv/bin/uvicorn --factory capture.api.app:create_app --host 127.0.0.1 --port $PORT --proxy-headers
Restart=always
RestartSec=3
MemoryMax=400M

[Install]
WantedBy=multi-user.target
EOF

echo "== nightly backup: the database every night (14 kept), the photos every Sunday (2 kept)"
cat > /usr/local/bin/capture-backup <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /var/backups/capture
stamp=$(date +%F)
sudo -u capture pg_dump -Fc capture > "db-$stamp.dump"
if [ "$(date +%u)" = 7 ]; then tar -czf "photos-$stamp.tgz" -C /srv/capture storage; fi
ls -1t db-*.dump | tail -n +15 | xargs -r rm --
ls -1t photos-*.tgz 2>/dev/null | tail -n +3 | xargs -r rm --
EOF
chmod 755 /usr/local/bin/capture-backup
cat > /etc/systemd/system/capture-backup.service <<'EOF'
[Unit]
Description=Back up the capture app's database and photos
[Service]
Type=oneshot
ExecStart=/usr/local/bin/capture-backup
EOF
cat > /etc/systemd/system/capture-backup.timer <<'EOF'
[Unit]
Description=Nightly capture backup
[Timer]
OnCalendar=*-*-* 02:30
Persistent=true
[Install]
WantedBy=timers.target
EOF

echo "== nginx: a new site for $DOMAIN only"
cat > /etc/nginx/sites-available/capture <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $APP_DIR/web;
    index index.html;
    client_max_body_size 120m;  # up to 20 photo pages in one upload

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    location ~ \\.mjs\$ {  # the PDF reader worker: browsers need a JavaScript type
        types {}
        default_type application/javascript;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    location / {
        try_files \$uri /index.html;
    }
}
EOF
ln -sf /etc/nginx/sites-available/capture /etc/nginx/sites-enabled/capture
nginx -t
systemctl reload nginx

systemctl daemon-reload
systemctl enable capture-backup.timer >/dev/null
systemctl start capture-backup.timer
echo "== setup done. Next: deploy/release.sh from the PC, then HTTPS (see deploy/README.md)."
