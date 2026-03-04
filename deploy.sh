#!/usr/bin/env bash
set -euo pipefail

REMOTE="influx.shelfwood.co"
REMOTE_DIR="/opt/base-shelfwood"
IMAGE="base-shelfwood"
CONTAINER="base-shelfwood"

echo "==> Building..."
node ./node_modules/.bin/astro build

echo "==> Syncing dist/ to ${REMOTE}:${REMOTE_DIR}/dist/"
rsync -az --delete dist/ "${REMOTE}:${REMOTE_DIR}/dist/"

echo "==> Rebuilding image on remote..."
ssh "$REMOTE" "cd ${REMOTE_DIR} && docker build -t ${IMAGE} . --quiet"

echo "==> Restarting container..."
ssh "$REMOTE" "
  docker rm -f ${CONTAINER} 2>/dev/null || true
  docker run -d \
    --name ${CONTAINER} \
    --restart unless-stopped \
    --env-file ${REMOTE_DIR}/.env \
    -p 127.0.0.1:3000:3000 \
    ${IMAGE}
"

echo "==> Waiting for container to start..."
sleep 2

STATUS=$(ssh "$REMOTE" "docker inspect --format='{{.State.Status}}' ${CONTAINER} 2>/dev/null || echo 'missing'")
if [ "$STATUS" != "running" ]; then
  echo "ERROR: container is not running (status: ${STATUS})"
  ssh "$REMOTE" "docker logs ${CONTAINER} 2>&1 | tail -20"
  exit 1
fi

echo "==> Done. https://base.shelfwood.co"
