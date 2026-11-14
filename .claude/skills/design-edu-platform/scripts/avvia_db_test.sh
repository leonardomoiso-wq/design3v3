#!/usr/bin/env bash
# Database di test che simula Supabase: PostgreSQL locale + tutte le
# migrazioni + PostgREST con ruolo anonimo "anon".
#
# Uso: avvia_db_test.sh <cartella-migrazioni> [seed.sql]
# Variabili: PG_BIN (default /usr/lib/postgresql/16/bin), PGTEST_DIR
# (default /var/tmp/pgtest), PGRST_BIN (default /var/tmp/postgrest; se
# manca viene scaricato da GitHub), DB (default e2e).
set -euo pipefail

MIGRAZIONI="${1:?Indica la cartella delle migrazioni}"
SEED="${2:-}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DIR="${PGTEST_DIR:-/var/tmp/pgtest}"
PORTA=5499
DB="${DB:-e2e}"
PGRST_BIN="${PGRST_BIN:-/var/tmp/postgrest}"

# Tabelle che nel progetto reale sono state create a mano da Supabase e
# che le migrazioni danno per esistenti: adattale al progetto.
BASE_SQL="${BASE_SQL:-create table if not exists casi_studio (id bigint primary key, gruppo_nome text, gruppo_num int, titolo text, descrizione text, immagine text, driver jsonb, x numeric, y numeric);}"

come_postgres() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ ! -d "$DIR/data" ]; then
  mkdir -p "$DIR"; [ "$(id -u)" = 0 ] && chown postgres "$DIR"
  come_postgres "$PG_BIN/initdb -D $DIR/data -U postgres -A trust >/dev/null"
fi
come_postgres "$PG_BIN/pg_ctl -D $DIR/data -o '-p $PORTA -k $DIR' -l $DIR/log status >/dev/null" \
  || come_postgres "$PG_BIN/pg_ctl -D $DIR/data -o '-p $PORTA -k $DIR' -l $DIR/log start >/dev/null"
sleep 2

P="psql -h $DIR -p $PORTA -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
$P -d "$DB" >/dev/null 2>&1 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end \$\$;
create schema extensions; create extension pgcrypto schema extensions;
create publication supabase_realtime;
alter database $DB set search_path = "\$user", public, extensions;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;
SQL
$P -d "$DB" -c "$BASE_SQL" >/dev/null

errori=0
for f in $(ls "$MIGRAZIONI"/*.sql | sort); do
  if out=$($P -d "$DB" -f "$f" 2>&1); then echo "ok    $(basename "$f")"; else echo "ERRORE $(basename "$f"):"; echo "$out" | grep -v NOTICE | head -5; errori=1; fi
done
[ -n "$SEED" ] && $P -d "$DB" -f "$SEED" && echo "seed  $(basename "$SEED")"

if [ ! -x "$PGRST_BIN" ]; then
  echo "Scarico PostgREST..."
  curl -sSL -o /var/tmp/pgrst.tar.xz https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar xf /var/tmp/pgrst.tar.xz -C "$(dirname "$PGRST_BIN")"
fi
pkill -f "$PGRST_BIN" 2>/dev/null || true
PGRST_DB_URI="postgres://postgres@/$DB?host=$DIR&port=$PORTA" PGRST_DB_ANON_ROLE=anon PGRST_DB_SCHEMAS=public PGRST_SERVER_PORT=3001 \
  nohup "$PGRST_BIN" > /var/tmp/pgrst.log 2>&1 &
sleep 2
echo "PostgreSQL: psql -h $DIR -p $PORTA -U postgres -d $DB"
echo "PostgREST:  http://localhost:3001"
exit $errori
