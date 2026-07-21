# Toolchain de dev/CI pour SpaceSim (monorepo pnpm).
# Permet de builder, tester et lancer le projet sans Node natif sur l'hôte :
# tout passe par ce conteneur (voir docker-compose.yml).
FROM node:22-bookworm-slim

# Outils de compilation pour les modules natifs (better-sqlite3)
# au cas où aucun binaire pré-compilé ne serait disponible.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# pnpm fourni par corepack ; la version est épinglée par le champ
# "packageManager" de package.json.
RUN corepack enable

WORKDIR /app
