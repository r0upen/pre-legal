#!/usr/bin/env bash
# Builds and starts Pre-Legal in Docker at http://localhost:8000.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=pre-legal
URL=http://localhost:8000

if ! command -v docker >/dev/null; then
  echo "Docker is not installed. Install Docker Desktop for Mac first."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Open Docker Desktop, wait until it is running, then try again."
  exit 1
fi

echo "Building the image..."
docker build -t "$NAME" .

# Replace any previous container; this also gives a fresh database.
docker rm -f "$NAME" >/dev/null 2>&1 || true

echo "Starting the container..."
if ! docker run -d --name "$NAME" -p 8000:8000 "$NAME" >/dev/null; then
  echo "Could not start the container. Is something else using port 8000?"
  exit 1
fi

for _ in $(seq 1 30); do
  if curl -fs "$URL/api/health" >/dev/null; then
    echo "Pre-Legal is running at $URL. Stop it with scripts/stop.sh."
    exit 0
  fi
  sleep 1
done

echo "Pre-Legal did not start within 30 seconds. Last log lines:"
docker logs --tail 30 "$NAME"
exit 1
