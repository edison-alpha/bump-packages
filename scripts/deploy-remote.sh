#!/usr/bin/env bash
# Runs on the VPS (piped over ssh by .semaphore/deploy.yml, or run by the Semaphore UI template via deploy/bump-packages.yml).
# bump-backend imports these packages straight from ../bump-packages, so a packages change only takes effect once the
# backend restarts: this pulls and installs the packages, restarts bump-backend, and waits for /api/health.
# Touches only the bump service: other apps on the box are never restarted.
set -euo pipefail

BUMP_DIR="${BUMP_DIR:-$HOME/bump}"
BUN="${BUN:-/usr/local/bin/bun}"
PORT="${BUMP_PORT:-7000}"

echo "==> bump-packages"
cd "$BUMP_DIR/bump-packages"
# `bun install` can rewrite bun.lock on the server; a dirty lockfile makes the next `git pull --ff-only` refuse.
git checkout -- bun.lock 2>/dev/null || true
git pull --ff-only
"$BUN" install

echo "==> restart bump-backend (it loads the packages at start)"
sudo systemctl restart bump-backend.service

echo "==> health"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health"; then
    echo
    echo "deploy ok: packages $(git -C "$BUMP_DIR/bump-packages" rev-parse --short HEAD), backend $(git -C "$BUMP_DIR/bump-backend" rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done

echo "health check failed; recent logs:" >&2
sudo journalctl -u bump-backend -n 40 --no-pager >&2
exit 1
