#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.docker.local.example}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE"
  exit 1
fi

echo "Using env file: $ENV_FILE"
docker compose --env-file "$ENV_FILE" down -v
docker compose --env-file "$ENV_FILE" up -d --build
docker compose --env-file "$ENV_FILE" ps
