#!/usr/bin/env bash
# Runs ON the server (unpacked into /tmp/tide-deploy by deploy.sh).
set -euo pipefail

SRC=/tmp/tide-deploy
DEST="${DEPLOY_DIR:-/srv/tide}"

if [ ! -d "$DEST" ]; then
  sudo -n mkdir -p "$DEST"
  sudo -n chown "$(id -un):$(id -gn)" "$DEST"
fi

# Swap the site atomically so a visitor never gets half a deploy.
rm -rf "$DEST/site.new"
cp -R "$SRC/site" "$DEST/site.new"
cp "$SRC/docker-compose.yml" "$SRC/nginx.conf" "$SRC/.env" "$DEST/"
rm -rf "$DEST/site.old"
[ -d "$DEST/site" ] && mv "$DEST/site" "$DEST/site.old"
mv "$DEST/site.new" "$DEST/site"

cd "$DEST"
# Recreate (not reload): the bind mount still points at the old directory
# after the mv above, so only a new container sees the new files.
docker compose up -d --force-recreate --remove-orphans
rm -rf "$DEST/site.old" "$SRC"
echo "DEPLOY_OK"
