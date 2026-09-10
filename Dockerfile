# Toolchain de dev/CI pour SpaceSim (monorepo pnpm).
# Permet de builder, tester et lancer le projet sans Node natif sur l'hôte :
# tout passe par ce conteneur (voir docker-compose.yml).
#
# L'image officielle Vite+ remplace `node:26-bookworm-slim` + corepack depuis le
# chantier 48. Elle apporte `vp` déjà installé, la toolchain C/C++ pour les
# dépendances natives, et surtout elle résout la version de Node depuis
# `devEngines` du package.json racine — la même source que la CI, au lieu des deux
# déclarations indépendantes qui pouvaient diverger en silence.
#
# Elle tourne en utilisateur non-root `vp` (uid 1000). C'est un gain pour l'e2e —
# le bac à sable de Chromium reste actif — et la seule contrainte est que les
# volumes nommés de node_modules doivent lui appartenir : voir docker-entrypoint.sh.
FROM ghcr.io/voidzero-dev/vite-plus:0.3.1

USER root
COPY docker-entrypoint.sh /usr/local/bin/spacesim-entrypoint
RUN chmod +x /usr/local/bin/spacesim-entrypoint
USER vp

WORKDIR /app
ENTRYPOINT ["/usr/local/bin/spacesim-entrypoint"]
