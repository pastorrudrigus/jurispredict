#!/usr/bin/env bash
# Gera supabase/migrations/TODAS.sql — as migrations concatenadas na ordem,
# para colar de uma vez só no SQL Editor do Supabase.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAIDA="$RAIZ/supabase/migrations/TODAS.sql"
{
  echo "-- GERADO por scripts/juntar-migrations.sh — não edite à mão."
  echo "-- Cole este arquivo INTEIRO no SQL Editor do Supabase, de uma vez."
  echo "-- A ordem importa: 0002 depende de 0001; 0004 depende de 0002."
  for f in "$RAIZ"/supabase/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
    echo; echo "-- ═════════════════════════════════════════════════════════"
    echo "-- $(basename "$f")"
    echo "-- ═════════════════════════════════════════════════════════"; echo
    cat "$f"
  done
} > "$SAIDA"
echo "$SAIDA ($(wc -l < "$SAIDA") linhas)"
