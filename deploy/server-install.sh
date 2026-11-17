#!/usr/bin/env bash
# Runs on the server (as root), called by release.sh: installs one release and switches to it.
# A failed step stops before the switch, so the running version keeps running.
set -euo pipefail

stamp="$1"
src="/tmp/capture-$stamp"
APP=/srv/capture
rel="$APP/releases/$stamp"

mkdir -p "$rel" "$APP/web.new"
tar -xf "$src/code.tar" -C "$rel"
tar -xzf "$src/web.tgz" -C "$APP/web.new"
cp "$src/VERSION" "$rel/VERSION"
chown -R capture:capture "$rel" "$APP/web.new"

echo "== installing Python packages, updating the database and the forms"
sudo -u capture bash -c "
  set -euo pipefail
  set -a; . /etc/capture/capture.env; set +a
  cd '$rel/server'
  uv sync --frozen --no-dev --quiet
  .venv/bin/python -c 'from capture.config import Settings; from capture.db.migrate import upgrade; upgrade(Settings().database_url)'
  .venv/bin/capture templates load
"

if [ ! -f /root/capture-admin-password.txt ]; then
  echo "== first release: creating the admin login"
  password=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
  sudo -u capture bash -c "set -a; . /etc/capture/capture.env; set +a; cd '$rel/server' && .venv/bin/capture users create admin 'Admin' admin --password '$password'"
  printf 'login: admin\npassword: %s\n' "$password" > /root/capture-admin-password.txt
  chmod 600 /root/capture-admin-password.txt
fi

echo "== switching to release $stamp ($(cat "$rel/VERSION"))"
ln -sfn "$rel" "$APP/current"
rm -rf "$APP/web.old"
if [ -d "$APP/web" ]; then mv "$APP/web" "$APP/web.old"; fi
mv "$APP/web.new" "$APP/web"
systemctl enable capture-api >/dev/null 2>&1
systemctl restart capture-api

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8100/api/health >/dev/null 2>&1; then
    echo "== running: $(curl -fsS http://127.0.0.1:8100/api/health)"
    ls -1dt "$APP"/releases/* | tail -n +4 | xargs -r rm -rf  # keep the last three releases
    rm -rf "$src"
    exit 0
  fi
  sleep 1
done
echo "The app did not start; see: journalctl -u capture-api -n 50" >&2
exit 1
