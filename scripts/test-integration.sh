#!/usr/bin/env sh
set -eu

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-myfin-api-tests}"
DB_USER="${DB_USER:-prisma}"
DB_PW="${DB_PW:-prisma}"

if [ -z "${DB_PORT:-}" ]; then
  DB_PORT="$(
    node -e "const net=require('node:net');const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const address=server.address();console.log(address.port);server.close();});"
  )"
fi

export DB_PORT COMPOSE_PROJECT_NAME

cleanup() {
  docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.tests.yml down -v
}

trap cleanup EXIT

dotenv -e .env.test -- docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.tests.yml up -d

until docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.tests.yml exec -T db mysqladmin ping -h 127.0.0.1 -u "$DB_USER" -p"$DB_PW" --silent; do
  sleep 1
done

dotenv -e .env.test -- npm run db:deploy
dotenv -e .env.test -- vitest --run --config vitest.config.integration.ts "$@"
