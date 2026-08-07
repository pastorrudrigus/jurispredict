#!/usr/bin/env bash
# Exercita as políticas de RLS num Postgres local, sem depender do Supabase.
#
# O harness recria o mínimo do Supabase (roles anon/authenticated/service_role,
# schema auth, auth.uid()), aplica as duas migrations e roda as asserções de
# supabase/tests/rls_test.sql. Qualquer política frouxa quebra o script.
#
#   ./scripts/testar-rls.sh
#
# Requer: postgres rodando localmente e permissão de rodar psql como o superuser.
set -euo pipefail

DB="${DB:-radar_rls_test}"
PSQL_USER="${PSQL_USER:-postgres}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# psql roda como outro usuário do SO e precisa enxergar os arquivos.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$RAIZ"/supabase/tests/harness.sql \
   "$RAIZ"/supabase/migrations/0001_init.sql \
   "$RAIZ"/supabase/migrations/0002_auth_saas.sql \
   "$RAIZ"/supabase/tests/rls_test.sql "$TMP"/
chmod -R a+rX "$TMP"

rodar() { su "$PSQL_USER" -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $TMP/$1"; }

su "$PSQL_USER" -c "dropdb --if-exists $DB && createdb $DB"

for arquivo in harness.sql 0001_init.sql 0002_auth_saas.sql rls_test.sql; do
  rodar "$arquivo" 2>&1 | grep -E "NOTICE|FALHOU|ERROR|=====" | sed 's/psql:[^ ]*sql:[0-9]*: //' || true
done
