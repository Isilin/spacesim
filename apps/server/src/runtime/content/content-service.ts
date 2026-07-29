import {
  BUILDING_IDS,
  BUILDINGS,
  CATEGORY_ADVANTAGE,
  COUNTER_BONUS,
  DIRECTIVE_COUNTER,
  DIRECTIVES,
  FACTION_IDS,
  FACTIONS,
  SHIP_IDS,
  SHIPS,
  WARSHIP_CATEGORY,
  WARSHIP_IDS,
  WARSHIPS,
  type BuildingDef,
  type CombatDef,
  type ShipDef,
} from "@spacesim/shared";
import { ContentRepository } from "./content-repository.js";
import type {
  ContentBuilding,
  ContentBundle,
  ContentFaction,
  ContentShip,
  ContentWarship,
} from "./content-types.js";

const repo = new ContentRepository();

/**
 * Libellés français des classes historiques, dupliqués depuis `apps/web/src/labels.ts`
 * (`WARSHIP_LABELS`) — `apps/server` ne peut pas dépendre d'`apps/web` (sens interdit,
 * voir CLAUDE.md). Sept entrées, seed one-shot uniquement : un admin peut les modifier
 * ensuite, ce n'est plus la source d'affichage une fois la table peuplée.
 */
const SEED_WARSHIP_LABELS: Record<string, { name: string; description: string }> = {
  fighter: { name: "Chasseur", description: "Rapide, létal en mêlée. Domine les croiseurs." },
  frigate: {
    name: "Frégate",
    description: "Polyvalente à moyenne portée. Domine les chasseurs.",
  },
  cruiser: { name: "Croiseur", description: "Lourd, longue portée. Domine les frégates." },
  support: {
    name: "Vaisseau de soutien",
    description: "Boucliers épais, +12 % dégâts de flotte.",
  },
  corvette: {
    name: "Corvette d'escorte",
    description: "Vive et bon marché. Harcèle croiseurs et cuirassés.",
  },
  bomber: {
    name: "Bombardier de ligne",
    description: "Frappe très loin, fragile de près. Éventre les frégates.",
  },
  dreadnought: {
    name: "Cuirassé",
    description: "Coque colossale, feu écrasant. Craint les nuées légères.",
  },
};

/** Vaisseaux de guerre historiques (`packages/shared`) au format `ContentWarship`. */
function seedWarships(): ContentWarship[] {
  return WARSHIP_IDS.map((id) => {
    const def = WARSHIPS[id];
    const label = SEED_WARSHIP_LABELS[id];
    return {
      id,
      nameFr: label?.name ?? id,
      descriptionFr: label?.description ?? "",
      hull: def.hull,
      shield: def.shield,
      weapons: def.weapons,
      initiative: def.initiative,
      category: WARSHIP_CATEGORY[id],
      cost: def.cost,
      buildMs: def.buildMs,
      requiresTech: def.requiresTech,
      fleetDamageBonus: def.fleetDamageBonus ?? null,
    };
  });
}

/**
 * Descriptions étendues des factions, dupliquées depuis `apps/web/src/labels.ts`
 * (`FACTION_LABELS`) — même raison que `SEED_WARSHIP_LABELS` ci-dessus. `name`/`color`
 * n'ont pas besoin de ce traitement : `content/factions.ts` les porte déjà en canonique.
 */
const SEED_FACTION_DESCRIPTIONS: Record<string, string> = {
  ferride: "Forges orbitales et chaînes de montage. Vend le métal, paie cher les vivres.",
  ostara_league: "Les greniers de la galaxie. Vend nourriture et biens, achète l'industrie.",
  aether_cartel: "Réacteurs, minerai brut et discrétion. Vend l'énergie, achète le raffiné.",
};

/** Factions historiques (`packages/shared`) au format `ContentFaction`. */
function seedFactions(): ContentFaction[] {
  return FACTION_IDS.map((id) => {
    const def = FACTIONS[id];
    return {
      id,
      name: def.name,
      color: def.color,
      descriptionFr: SEED_FACTION_DESCRIPTIONS[id] ?? "",
      produces: def.produces,
      consumes: def.consumes,
    };
  });
}

/**
 * Libellés français des bâtiments, dupliqués depuis `apps/web/src/labels.ts`
 * (`BUILDING_LABELS`) — même raison que `SEED_WARSHIP_LABELS` ci-dessus.
 */
const SEED_BUILDING_LABELS: Record<string, { name: string; description: string }> = {
  mine: { name: "Mine", description: "Extrait le minerai (selon gisement)." },
  power_plant: { name: "Centrale", description: "Produit de l'énergie (selon gisement)." },
  farm: { name: "Ferme", description: "Produit de la nourriture (selon gisement)." },
  habitat: {
    name: "Habitat",
    description: "20 logements par niveau (modulés par l'habitabilité).",
  },
  storage_depot: { name: "Entrepôt", description: "+1000 de stockage par niveau." },
  laboratory: {
    name: "Laboratoire",
    description: "Produit de la science, consomme de l'énergie.",
  },
  smelter: { name: "Fonderie", description: "Minerai + énergie → métaux." },
  component_factory: {
    name: "Usine de composants",
    description: "Métaux + énergie → composants.",
  },
  goods_factory: {
    name: "Usine de biens",
    description: "Métaux + énergie → biens de consommation.",
  },
  shipyard: { name: "Chantier naval", description: "Produit les vaisseaux civils (cargos)." },
  monument: {
    name: "Monument",
    description: "Rayonnement culturel : +0,5 influence par tick.",
  },
  orbital_dock: {
    name: "Dock orbital",
    description:
      "Entrepôt en orbite et ascenseur vers le sol. Indispensable : les vaisseaux ne chargent que ce qui est en orbite.",
  },
};

/** Bâtiments historiques (`packages/shared`) au format `ContentBuilding`. */
function seedBuildings(): ContentBuilding[] {
  return BUILDING_IDS.map((id) => {
    const def = BUILDINGS[id];
    const label = SEED_BUILDING_LABELS[id];
    return {
      id,
      nameFr: label?.name ?? id,
      descriptionFr: label?.description ?? "",
      cost: def.cost,
      buildMs: def.buildMs,
      outputs: def.outputs ?? null,
      inputs: def.inputs ?? null,
      depositScaled: def.depositScaled ?? null,
      jobsPerInstance: def.jobsPerInstance ?? null,
    };
  });
}

/**
 * Libellés français des classes civiles historiques, dupliqués depuis `apps/web/src/labels.ts`
 * (`SHIP_LABELS`) — même raison que `SEED_WARSHIP_LABELS` ci-dessus.
 */
const SEED_SHIP_LABELS: Record<string, { name: string; description: string }> = {
  cargo_small: { name: "Cargo léger", description: "Soute de 200. Le mulet de l'espace." },
  cargo_large: {
    name: "Cargo lourd",
    description: "Soute de 600. Requiert la logistique orbitale.",
  },
  hauler: {
    name: "Transporteur",
    description: "Soute de 1800, lent et gourmand. Requiert l'ascenseur spatial.",
  },
  courier: { name: "Courrier", description: "Soute de 80, très rapide. Idéal pour les urgences." },
};

/** Vaisseaux civils historiques (`packages/shared`) au format `ContentShip`. */
function seedShips(): ContentShip[] {
  return SHIP_IDS.map((id) => {
    const def = SHIPS[id];
    const label = SEED_SHIP_LABELS[id];
    return {
      id,
      nameFr: label?.name ?? id,
      descriptionFr: label?.description ?? "",
      capacity: def.capacity,
      cost: def.cost,
      buildMs: def.buildMs,
      requiresTech: def.requiresTech ?? null,
      speedMult: def.speedMult,
      fuelPerJump: def.fuelPerJump,
    };
  });
}

/**
 * Amorce le contenu une fois dans la vie d'une base (idempotent, sûr à chaque boot —
 * même idiome que `BootstrapService.ensureNpcPopulation` : compter, compléter si vide).
 * Libellés français repris des tables `SEED_*` ci-dessus ; `apps/web/src/labels.ts` garde
 * ses propres tables en parallèle tant que ces domaines n'y sont pas entièrement migrés —
 * un admin peut déjà éditer les champs français ici.
 */
export async function ensureContentSeeded(): Promise<void> {
  if ((await repo.countWarships()) === 0) {
    await repo.insertWarships(seedWarships());
  }
  if (!(await repo.hasTuning())) {
    await repo.insertTuning({
      categoryAdvantage: CATEGORY_ADVANTAGE,
      directives: DIRECTIVES,
      directiveCounter: DIRECTIVE_COUNTER,
      counterBonus: COUNTER_BONUS,
    });
  }
  if ((await repo.countFactions()) === 0) {
    await repo.insertFactions(seedFactions());
  }
  if ((await repo.countBuildings()) === 0) {
    await repo.insertBuildings(seedBuildings());
  }
  if ((await repo.countShips()) === 0) {
    await repo.insertShips(seedShips());
  }
}

/** Charge tout le contenu depuis la DB — appelé au boot puis après chaque édition admin
 *  (remplacement en bloc de `GameRuntime.content`, jamais de mutation en place). */
export async function loadContentBundle(): Promise<ContentBundle> {
  const [warships, combatTuning, factions, buildings, ships] = await Promise.all([
    repo.loadWarships(),
    repo.loadTuning(),
    repo.loadFactions(),
    repo.loadBuildings(),
    repo.loadShips(),
  ]);
  return { warships, combatTuning, factions, buildings, ships };
}

/** Convertit les vaisseaux de guerre chargés en table de combat (`sim/military/combat.ts`
 *  `defs`) — même forme que `WARSHIP_COMBAT_DEFS`, sourcée depuis le contenu DB-backed. */
export function combatDefsFromWarships(
  warships: Record<string, ContentWarship>,
): Record<string, CombatDef> {
  return Object.fromEntries(
    Object.entries(warships).map(([id, w]) => [
      id,
      {
        hull: w.hull,
        shield: w.shield,
        weapons: w.weapons,
        initiative: w.initiative,
        fleetDamageBonus: w.fleetDamageBonus ?? 0,
        category: w.category,
      } satisfies CombatDef,
    ]),
  );
}

/** Convertit les bâtiments chargés en table de définitions (`sim/industry/colony.ts`
 *  `buildings`) — même forme que `BUILDINGS`, sourcée depuis le contenu DB-backed. */
export function buildingDefsFromContent(
  buildings: Record<string, ContentBuilding>,
): Record<string, BuildingDef> {
  return Object.fromEntries(
    Object.entries(buildings).map(([id, b]) => [
      id,
      {
        id: id as BuildingDef["id"],
        cost: b.cost,
        buildMs: b.buildMs,
        outputs: b.outputs ?? undefined,
        inputs: b.inputs ?? undefined,
        depositScaled: (b.depositScaled ?? undefined) as BuildingDef["depositScaled"],
        jobsPerInstance: b.jobsPerInstance ?? undefined,
      } satisfies BuildingDef,
    ]),
  );
}

/** Convertit les vaisseaux civils chargés en table de définitions (`sim/industry/ships.ts`
 *  `legacyCapacity`/`enqueueShip`, `sim/exploration/travel.ts` `legacyConvoyStat`) — même
 *  forme que `SHIPS`, sourcée depuis le contenu DB-backed. */
export function shipDefsFromContent(ships: Record<string, ContentShip>): Record<string, ShipDef> {
  return Object.fromEntries(
    Object.entries(ships).map(([id, s]) => [
      id,
      {
        id: id as ShipDef["id"],
        capacity: s.capacity,
        cost: s.cost,
        buildMs: s.buildMs,
        requiresTech: s.requiresTech ?? undefined,
        speedMult: s.speedMult,
        fuelPerJump: s.fuelPerJump,
      } satisfies ShipDef,
    ]),
  );
}

export { ContentRepository };
