#!/bin/sh
# Sauvegarde de l'univers officiel (chantier 20.6) — pg_dump au format custom
# (compressé, restaurable sélectivement via pg_restore), horodatée.
#
# Usage : DATABASE_URL=postgres://... scripts/backup.sh [dossier_de_sortie]
# Dans le compose de dev (le conteneur `postgres` a `pg_dump`, l'hôte non) :
#   docker compose exec -T -e PGPASSWORD=spacesim postgres \
#     pg_dump -Fc -h localhost -U spacesim -d spacesim \
#     > backups/spacesim-$(date +%Y%m%d-%H%M%S).dump
#
# Restauration :
#   pg_restore -d "$DATABASE_URL" --clean --if-exists chemin/vers/le.dump

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL manquant (postgres://user:pass@host:port/db)" >&2
  exit 1
fi

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$OUT_DIR/spacesim-$STAMP.dump"

pg_dump -Fc "$DATABASE_URL" > "$OUT_FILE"
echo "Sauvegarde écrite : $OUT_FILE"
