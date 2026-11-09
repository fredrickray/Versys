#!/usr/bin/env bash
# Runs on the staging/prod host after the image is pushed to GHCR.
set -euo pipefail

ROOT="${DEPLOY_ROOT:-$HOME/versys}"
IMAGE="${VERSYS_IMAGE:?VERSYS_IMAGE required e.g. ghcr.io/owner/versys:staging}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.deploy.yml}"
ENV_FILE="${ENV_FILE:-.env.deploy}"

mkdir -p "$ROOT"
cd "$ROOT"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing $ROOT/$COMPOSE_FILE — copy it from the repo once (see docs/runbooks/deploy.md)" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ROOT/$ENV_FILE — create from .env.deploy.example" >&2
  exit 1
fi

echo "Pulling $IMAGE"
docker pull "$IMAGE"

export VERSYS_IMAGE="$IMAGE"

echo "Migrate + seed (no demo users)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile ops run --rm migrate
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile ops run --rm seed

echo "Restart api / realtime / worker"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis api realtime worker

echo "Health"
sleep 3
curl -fsS "http://127.0.0.1:${API_HOST_PORT:-3000}/v1/health" || true
echo
echo "Deploy complete: $IMAGE"
