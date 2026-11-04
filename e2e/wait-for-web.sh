#!/usr/bin/env bash
#
# Wait for the explicitly prepared local E2E web service to answer.
#
# Usage: bash e2e/wait-for-web.sh [url ...]
set -euo pipefail

URLS=("$@")
if [ ${#URLS[@]} -eq 0 ]; then
  URLS=("http://localhost:1515/")
fi

# Half-second polling keeps startup checks responsive.
DEADLINE=$((SECONDS + 180))

for url in "${URLS[@]}"; do
  echo "Waiting for web to be ready on ${url}..."
  until curl -sf -o /dev/null "$url" 2>/dev/null; do
    if [ "$SECONDS" -ge "$DEADLINE" ]; then
      echo "ERROR: ${url} did not become ready in time."
      docker compose logs
      exit 1
    fi
    sleep 0.5
  done
  echo "Ready: ${url}"
done
