#!/usr/bin/env bash
#
# Plan 195 — stand up the local test database from nothing.
#
# Idempotent: safe to re-run. Creates the role, the database and the one
# extension the schema needs, then applies every migration.
#
# Docker was the original intent for this, but this machine has no Docker and no
# container runtime, and native Postgres gives the same isolation with no Docker
# Desktop install, no admin password and faster resets (`dropdb` beats a
# container teardown). `npm run test:env:reset` is the re-roll.
#
set -euo pipefail

PG_VERSION="17"
DB_NAME="abtalks_test"
DB_USER="abtalks_test"
DB_PASS="abtalks_test"
DB_HOST="127.0.0.1"
DB_PORT="5432"

say() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
ok()  { printf '   \033[32m✓\033[0m %s\n' "$1"; }
die() { printf '\n\033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }

# --- 1. Postgres present? ----------------------------------------------------
say "Postgres ${PG_VERSION}"

if ! command -v brew >/dev/null 2>&1; then
  die "Homebrew not found. Install Postgres ${PG_VERSION} yourself, then re-run."
fi

if ! brew list --formula 2>/dev/null | grep -qx "postgresql@${PG_VERSION}"; then
  echo "   installing postgresql@${PG_VERSION} (a few minutes, once)…"
  brew install "postgresql@${PG_VERSION}"
fi

PG_BIN="$(brew --prefix "postgresql@${PG_VERSION}")/bin"
[ -d "$PG_BIN" ] || die "Expected Postgres binaries at ${PG_BIN}"
export PATH="${PG_BIN}:${PATH}"
ok "binaries at ${PG_BIN}"

# --- 2. Running? -------------------------------------------------------------
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
  echo "   starting the service…"
  brew services start "postgresql@${PG_VERSION}" >/dev/null
  for _ in $(seq 1 30); do
    pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1 && break
    sleep 1
  done
fi
pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1 \
  || die "Postgres did not come up on ${DB_HOST}:${DB_PORT}"
ok "accepting connections on ${DB_HOST}:${DB_PORT}"

# --- 3. Role ----------------------------------------------------------------
say "Role and database"

# Connects as the current OS user, which the Homebrew install makes a superuser.
psql -h "$DB_HOST" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}' SUPERUSER;
  END IF;
END \$\$;
SQL
ok "role ${DB_USER}"

if psql -h "$DB_HOST" -p "$DB_PORT" -d postgres -tAc \
     "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  ok "database ${DB_NAME} (already present)"
else
  createdb -h "$DB_HOST" -p "$DB_PORT" -O "$DB_USER" "$DB_NAME"
  ok "database ${DB_NAME} (created)"
fi

# pg_trgm is the only extension the migrations need (they create it themselves,
# but doing it here means a migration failure is never about permissions).
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q \
  -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
ok "extension pg_trgm"

# --- 4. Schema ---------------------------------------------------------------
say "Migrations"
URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy

TABLES=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
ok "${TABLES} tables"

printf '\n\033[32mDatabase ready.\033[0m Next: \033[1mnpm run test:env:bootstrap\033[0m\n\n'
