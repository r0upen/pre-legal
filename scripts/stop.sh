#!/usr/bin/env bash
# Stops Pre-Legal and removes its container (and with it the database).
set -euo pipefail

NAME=pre-legal

if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
  echo "Docker is not running, so Pre-Legal is not running either."
  exit 0
fi

if [ -n "$(docker ps -aq --filter "name=^${NAME}$")" ]; then
  # stop sends SIGTERM so the server shuts down gracefully; rm deletes the container.
  docker stop "$NAME" >/dev/null
  docker rm "$NAME" >/dev/null
  echo "Pre-Legal stopped."
else
  echo "Pre-Legal is not running."
fi
