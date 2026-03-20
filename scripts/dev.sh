#!/usr/bin/env bash
# dev.sh — start SSH tunnel to TimescaleDB then run astro dev.
# Tunnel: localhost:5433 → timescaledb-mc:5432 (Docker-internal) via infrastructure.shelfwood.co
# Killed automatically when astro dev exits (Ctrl+C or crash).

set -euo pipefail

TUNNEL_HOST="infrastructure.shelfwood.co"
LOCAL_PORT="5433"
REMOTE_HOST="10.0.1.7"
REMOTE_PORT="5432"
TUNNEL_PID=""

cleanup() {
  if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo ""
    echo "[dev] Closing SSH tunnel (pid $TUNNEL_PID)..."
    kill "$TUNNEL_PID"
  fi
}
trap cleanup EXIT INT TERM

# Check if something is already listening on the local port
if lsof -i "TCP:${LOCAL_PORT}" -sTCP:LISTEN -t &>/dev/null; then
  echo "[dev] Port ${LOCAL_PORT} already in use — assuming tunnel is open, skipping."
else
  echo "[dev] Opening SSH tunnel: localhost:${LOCAL_PORT} → ${REMOTE_HOST}:${REMOTE_PORT} via ${TUNNEL_HOST}"
  ssh -f -N -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=30 \
      -o ServerAliveCountMax=3 \
      -L "${LOCAL_PORT}:${REMOTE_HOST}:${REMOTE_PORT}" \
      "$TUNNEL_HOST"
  # Grab the PID of the background ssh process
  TUNNEL_PID=$(lsof -i "TCP:${LOCAL_PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1)
  echo "[dev] Tunnel open (pid ${TUNNEL_PID})"
fi

echo "[dev] Starting astro dev..."
astro dev
