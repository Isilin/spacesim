#!/bin/sh
# Les node_modules et le cache navigateur vivent dans des volumes nommés, pour que les
# binaires Linux ne se mélangent jamais à l'hôte Windows (voir docker-compose.yml).
# Docker crée ces
# volumes appartenant à root, or l'image Vite+ tourne en utilisateur `vp` (uid 1000) :
# sans ce chown, `pnpm install` échoue en « Permission denied ».
#
# Le bind mount `.:/app` ne pose pas le problème — Docker Desktop le monte en 0777.
# Seuls les volumes nommés sont concernés.
#
# La réparation est marquée par un fichier témoin PLUTÔT que déduite du propriétaire
# du dossier de tête : le magasin pnpm vit dans `node_modules/.pnpm-store`, et un
# dossier de tête déjà réattribué peut garder des enfants appartenant à root. C'est
# le cas des volumes peuplés avant le chantier 48, quand le conteneur tournait en
# root — un test sur la tête seule les laissait cassés en profondeur.
#
# Le témoin garantit un seul passage par volume : sur un volume neuf le `-R` porte
# sur un dossier vide, donc instantané.
#
# `sudo` est sans mot de passe dans cette image, c'est prévu pour ce genre d'amorçage.
set -e

for dir in /app/node_modules /app/packages/*/node_modules /app/apps/*/node_modules \
  /home/vp/.cache/ms-playwright; do
  if [ -d "$dir" ] && [ ! -f "$dir/.vp-owned" ]; then
    sudo chown -R vp:vp "$dir"
    touch "$dir/.vp-owned"
  fi
done

# Les épinglages de Vite+ vivent à trois endroits (package.json, les deux tags d'image,
# le fournisseur de couverture) et rien ne vérifiait leur accord. Le contrôle tourne ici
# parce que c'est le seul point commun à tous les services, et avant toute installation.
#
# Le script est lu depuis le bind mount plutôt que copié dans l'image : il compare l'image
# au dépôt, et une copie figée dans l'image pourrait mentir sur l'une des deux moitiés.
# `sh` explicite — le bit d'exécution ne survit pas toujours à un checkout Windows.
if [ -f /app/scripts/check-toolchain.sh ]; then
  sh /app/scripts/check-toolchain.sh
else
  echo "entrypoint: scripts/check-toolchain.sh introuvable, accord de versions NON vérifié" >&2
fi

exec "$@"
