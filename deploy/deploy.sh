#!/usr/bin/env bash
# Build and publish the static app to your own server (nginx + Traefik recipe).
#
# Configure deploy/.env first (copy deploy/.env.example). The upload uses a
# single SSH connection: build locally, stream a tarball, run remote.sh there.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f deploy/.env ]; then
  echo "Missing deploy/.env — copy deploy/.env.example and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. deploy/.env
set +a
: "${DEPLOY_SSH:?}" "${DEPLOY_DIR:?}" "${TIDE_HOST:?}"

npm test
npm run build

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/tide-deploy"
cp -R dist "$STAGE/tide-deploy/site"
cp deploy/docker-compose.yml deploy/nginx.conf deploy/remote.sh "$STAGE/tide-deploy/"
cp deploy/.env "$STAGE/tide-deploy/.env"

# COPYFILE_DISABLE / --no-xattrs: keep macOS metadata out of the tarball.
COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C "$STAGE" tide-deploy |
  ssh "$DEPLOY_SSH" "cd /tmp && rm -rf tide-deploy && tar xzf - && DEPLOY_DIR='$DEPLOY_DIR' bash /tmp/tide-deploy/remote.sh"

echo "Checking https://$TIDE_HOST ..."
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" "https://$TIDE_HOST/"
