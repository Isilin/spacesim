# Toolchain de dev/CI pour SpaceSim (monorepo pnpm).
# Permet de builder, tester et lancer le projet sans Node natif sur l'hôte :
# tout passe par ce conteneur (voir docker-compose.yml).
FROM node:26-bookworm-slim

# Plus de module natif à compiler depuis le chantier 20.3 (Postgres/PGlite —
# driver pur JS + moteur WASM) : pas besoin de python3/make/g++ (nécessaires à
# better-sqlite3, abandonné à cette étape).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# pnpm fourni par corepack ; la version est épinglée par le champ
# "packageManager" de package.json.
#
# Node 26 ne livre plus corepack — il a été dégroupé de la distribution, et
# `corepack enable` échoue à la construction avec « not found ». On l'installe donc
# depuis npm, plutôt que de faire un `npm i -g pnpm@9.15.0` qui recopierait ici une
# version déjà écrite dans "packageManager" et la laisserait diverger en silence.
RUN npm install -g corepack@latest && corepack enable

WORKDIR /app
