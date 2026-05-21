#!/usr/bin/env bash
# new-branch.sh — crea e switcha su un nuovo branch di lavorazione
#
# Uso:
#   ./scripts/new-branch.sh fix/piano-timeout
#   ./scripts/new-branch.sh feature/archivio-esami
#
# Prefissi supportati: feature | fix | perf | hotfix | test | chore
set -euo pipefail

VALID_PREFIXES="feature|fix|perf|hotfix|test|chore"

if [[ $# -lt 1 ]]; then
  echo ""
  echo "  Uso: $0 <tipo/nome-breve>"
  echo ""
  echo "  Tipi supportati: ${VALID_PREFIXES//|/, }"
  echo ""
  echo "  Esempi:"
  echo "    $0 fix/piano-timeout"
  echo "    $0 feature/archivio-esami"
  echo "    $0 perf/ottimizza-quiz"
  echo ""
  exit 1
fi

BRANCH="$1"

# Valida il prefisso
PREFIX="${BRANCH%%/*}"
if ! echo "$PREFIX" | grep -qE "^(${VALID_PREFIXES})$"; then
  echo "❌  Prefisso non valido: '${PREFIX}'"
  echo "   Usa uno tra: ${VALID_PREFIXES//|/, }"
  exit 1
fi

# Assicura che siamo aggiornati rispetto a origin/main
echo "→ Aggiorno main da origin…"
git fetch origin main --quiet

# Crea il branch partendo dall'ultimo main remoto
git checkout -b "$BRANCH" origin/main

echo ""
echo "✓  Branch '${BRANCH}' creato da origin/main"
echo ""
echo "  Lavora e committa normalmente, poi:"
echo "    git push origin HEAD"
echo "  Apri la PR su GitHub verso main."
echo ""
