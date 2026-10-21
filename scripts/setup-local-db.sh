#!/usr/bin/env bash
# Idempotent local Postgres 16 setup: starts the cluster, sets the postgres
# password, creates invoice_dev, invoice_test (integration tests) and
# invoice_e2e (Playwright), and writes .env.local.
set -euo pipefail

PG_USER=postgres
PG_PASSWORD=postgres
DATABASES=(invoice_dev invoice_test invoice_e2e)

cd "$(dirname "$0")/.."

if ! pg_lsclusters --no-header | awk '$1 == 16 && $2 == "main" { print $4 }' | grep -q '^online$'; then
  pg_ctlcluster 16 main start
fi

for _ in $(seq 1 30); do
  pg_isready -q -h localhost -p 5432 && break
  sleep 1
done
pg_isready -h localhost -p 5432

as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then
    runuser -u postgres -- "$@"
  else
    sudo -n -u postgres "$@"
  fi
}

as_postgres psql -v ON_ERROR_STOP=1 -qc "ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASSWORD}';"

for db in "${DATABASES[@]}"; do
  exists=$(as_postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'")
  if [ "$exists" != "1" ]; then
    as_postgres createdb "$db"
    echo "created database ${db}"
  else
    echo "database ${db} already exists"
  fi
done

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "wrote .env.local from .env.example"
fi
