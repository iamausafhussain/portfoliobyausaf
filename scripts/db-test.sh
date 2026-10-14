#!/usr/bin/env bash
# Spin up a throwaway Postgres, apply every migration (twice, to prove they are re-runnable),
# load the seed, run the security tests, then shut everything down.
#
#   npm run db:test
#
# Needs PostgreSQL 15+ server binaries (initdb, pg_ctl, postgres, psql). Set PG_BIN to their
# folder if they are not on PATH. Nothing here touches your Supabase project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.pgtest"
PORT="${PGTEST_PORT:-54329}"

find_pg_bin() {
  if [[ -n "${PG_BIN:-}" ]]; then echo "$PG_BIN"; return; fi
  if command -v pg_config >/dev/null 2>&1 && [[ -x "$(pg_config --bindir)/initdb" ]]; then
    pg_config --bindir; return
  fi
  if command -v initdb >/dev/null 2>&1; then dirname "$(command -v initdb)"; return; fi
  local d
  d="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -n "$d" ]]; then echo "$d"; return; fi
  echo "PostgreSQL server tools not found. Install PostgreSQL 15+ or set PG_BIN." >&2
  exit 1
}
BIN="$(find_pg_bin)"

# initdb refuses to run as root; use the postgres OS user when we are root (CI containers).
RUN=()
if [[ "$(id -u)" == "0" ]]; then
  if ! id postgres >/dev/null 2>&1; then useradd -r postgres; fi
  RUN=(runuser -u postgres --)
fi

cleanup() {
  "${RUN[@]}" "$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

rm -rf "$DATA"
mkdir -p "$DATA"
[[ ${#RUN[@]} -gt 0 ]] && chown postgres "$DATA"

"${RUN[@]}" "$BIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null

PSQL=(env PGOPTIONS="-c client_min_messages=warning" "${RUN[@]}" "$BIN/psql" -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

echo "▸ Bootstrapping local Supabase stand-in"
"${PSQL[@]}" -f "$ROOT/supabase/tests/bootstrap.sql"

for pass in 1 2; do
  echo "▸ Applying migrations (pass $pass)"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "   $(basename "$f")"
    "${PSQL[@]}" -f "$f"
  done
done

echo "▸ Loading seed (twice)"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"

echo "▸ Running security and schema tests"
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls.test.sql" 2>&1 \
  | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR): +(ok +)?/  \1 /; s/^  NOTICE /  ✓ /; s/^  ERROR /  ✗ /' 
