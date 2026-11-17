#!/usr/bin/env bash
# Put the committed app on the server: build the website here, copy it with the server code, install, restart.
# From the repo root in Git Bash:  bash deploy/release.sh [root@159.89.193.93]
# Sends what is committed (HEAD), so commit first. The server needs no GitHub access and no Node.
set -euo pipefail

HOST="${1:-root@159.89.193.93}"
cd "$(git rev-parse --show-toplevel)"
if ! git diff --quiet HEAD -- server templates web/src web/index.html web/package.json web/package-lock.json; then
  echo "Commit your changes first: the release sends what is committed." >&2
  exit 1
fi

stamp=$(date +%Y%m%d-%H%M%S)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "== building the website"
(cd web && npm run build >/dev/null)
tar -czf "$work/web.tgz" -C web/dist .
git archive --format=tar HEAD server templates > "$work/code.tar"
echo "$(git rev-parse --short HEAD)" > "$work/VERSION"

echo "== sending release $stamp to $HOST"
ssh "$HOST" "mkdir -p /tmp/capture-$stamp"
scp -q "$work/code.tar" "$work/web.tgz" "$work/VERSION" deploy/server-install.sh "$HOST:/tmp/capture-$stamp/"
ssh "$HOST" "bash /tmp/capture-$stamp/server-install.sh $stamp"
