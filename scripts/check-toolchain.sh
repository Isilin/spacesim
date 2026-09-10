#!/bin/sh
# Vérifie que les épinglages de Vite+ sont d'accord entre eux (chantier 49).
#
# Trois déclarations doivent bouger ensemble, et rien ne le vérifiait :
#
#   package.json      "vite-plus"              → le CLI installé par pnpm
#   Dockerfile(.e2e)  ghcr.io/…/vite-plus:X    → le CLI de l'image
#   package.json      "@vitest/coverage-v8"    → doit égaler le vitest QU'EMBARQUE Vite+
#
# Un décalage ne se voit qu'à l'exécution : Vite+ impose une copie unique de vitest, et
# `vp test --coverage` refuse de démarrer si le fournisseur ne correspond pas. Le
# comparateur ci-dessous prend le `vp` du PATH — donc celui de l'IMAGE quand il tourne
# depuis le point d'entrée — et le confronte à ce que déclare le dépôt.
#
# Shell pur, sans Node : il tourne au démarrage du conteneur, avant toute installation.
set -e

manifest="${1:-/app/package.json}"

fail() {
  echo "check-toolchain: $1" >&2
  exit 1
}

# Extrait la version déclarée pour un paquet. Rend une chaîne vide si absent.
declared() {
  grep -o "\"$1\": *\"[^\"]*\"" "$manifest" | head -1 | sed 's/.*: *"//; s/"$//'
}

if [ ! -f "$manifest" ]; then
  fail "manifeste introuvable : $manifest"
fi

if ! command -v vp >/dev/null 2>&1; then
  fail "vp absent du PATH"
fi

version_output="$(vp --version 2>/dev/null)" || fail "vp --version a échoué"

cli="$(echo "$version_output" | awk 'NR==1 { sub(/^v/, "", $2); print $2 }')"
bundled_vitest="$(echo "$version_output" | awk '$1 == "vitest" { sub(/^v/, "", $2); print $2 }')"

# --- 1. Le CLI de l'image contre celui que déclare le dépôt.
want_cli="$(declared vite-plus)"
[ -n "$want_cli" ] || fail "\"vite-plus\" absent de $manifest"

case "$want_cli" in
  *^* | *~* | *' '* | '*')
    fail "\"vite-plus\": \"$want_cli\" — épinglage EXACT attendu, sans plage.
      Une plage laisse le CLI monter pendant que le tag d'image reste figé."
    ;;
esac

if [ "$cli" != "$want_cli" ]; then
  fail "désaccord de version Vite+.
      image      : $cli   (tag du Dockerfile)
      package.json : $want_cli
      Monter les deux ensemble, ou l'un des deux ment."
fi

# --- 2. Le fournisseur de couverture contre le vitest embarqué.
want_coverage="$(declared @vitest/coverage-v8)"

if [ -n "$want_coverage" ] && [ -n "$bundled_vitest" ]; then
  case "$want_coverage" in
    *^* | *~*)
      fail "\"@vitest/coverage-v8\": \"$want_coverage\" — épinglage EXACT attendu.
      Il doit suivre le vitest qu'embarque Vite+, pas une plage sémantique."
      ;;
  esac

  if [ "$want_coverage" != "$bundled_vitest" ]; then
    fail "le fournisseur de couverture ne suit pas le vitest embarqué.
      vitest embarqué par vp : $bundled_vitest
      @vitest/coverage-v8    : $want_coverage
      \`vp test --coverage\` refuserait de démarrer."
  fi
fi

echo "check-toolchain: vite-plus $cli, vitest $bundled_vitest — accord vérifié"
