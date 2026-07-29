import {
  BUILDING_IDS,
  BUILDINGS,
  CATEGORY_ADVANTAGE,
  CHASSIS,
  CHASSIS_IDS,
  COUNTER_BONUS,
  DEFAULT_BALANCE,
  DIRECTIVE_COUNTER,
  DIRECTIVES,
  FACTION_IDS,
  FACTIONS,
  MODULES,
  MODULE_IDS,
  SHIP_IDS,
  SHIPS,
  TECH_IDS,
  TECHS,
  WARSHIP_CATEGORY,
  WARSHIP_IDS,
  WARSHIPS,
  type BalanceConstants,
  type BuildingDef,
  type ChassisDef,
  type CombatDef,
  type ModuleDef,
  type ShipDef,
  type TechDef,
} from "@spacesim/shared";
import { ContentRepository } from "./content-repository.js";
import type {
  ContentBuilding,
  ContentBundle,
  ContentChassis,
  ContentConstant,
  ContentFaction,
  ContentModule,
  ContentShip,
  ContentTech,
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
 * Descriptions françaises des scalaires d'équilibrage (chantier 23.8) — clés = champs de
 * `BalanceConstants`. Pas de `SEED_*_LABELS` équivalent côté `apps/web/src/labels.ts` :
 * ces valeurs n'ont jamais eu de représentation joueur, seulement des commentaires TS.
 */
const SEED_CONSTANT_LABELS: Record<keyof BalanceConstants, string> = {
  baseStorage: "Capacité de stockage de base, par ressource plafonnée.",
  storagePerDepot: "Stockage additionnel par niveau d'entrepôt.",
  maxQueueLength: "Taille max de la file de construction d'une colonie.",
  noDepositModifier: "Modificateur de production quand la planète n'a pas de gisement.",
  foodPerColonist: "Nourriture consommée par colon et par tick.",
  housingPerHabitat: "Logements fournis par niveau d'habitat.",
  creditsPerColonist: "Impôt en crédits par colon et par tick, à satisfaction pleine.",
  popGrowthBase: "Taux de croissance de population de base par tick.",
  satisfactionGrowthThreshold: "Seuil de satisfaction en-dessous duquel la population décline.",
  goodsPerColonist: "Biens de consommation désirés par colon et par tick.",
  raidFraction: "Fraction des ressources pillées lors d'un raid PvP réussi.",
  transferBaseMs: "Durée de base d'un convoi (barème abstrait sans vaisseau précisé).",
  transferMsPerJump: "Durée additionnelle par saut pour un convoi.",
  transferBaseCredits: "Frais de base d'un convoi.",
  transferCreditsPerJump: "Frais additionnels par saut pour un convoi.",
  fuelPerMassJump: "Carburant lié à la masse transportée, par unité et par saut.",
  gatewayTollCredits: "Péage prélevé à chaque portail inter-galactique emprunté.",
  probeCostCredits: "Coût en crédits d'une sonde d'exploration.",
  probeBaseMs: "Durée de base d'une sonde d'exploration.",
  probeMsPerJump: "Durée additionnelle par saut pour une sonde.",
  colonyShipBaseMs: "Durée de base d'un trajet de vaisseau colonial.",
  colonyShipMsPerJump: "Durée additionnelle par saut pour un vaisseau colonial.",
  newColonyPopulation: "Population de départ d'une colonie fondée par vaisseau colonial.",
  orbitalCapPerDock: "Capacité de stockage orbital par niveau de dock.",
  liftPerDock: "Débit de l'ascenseur orbital par niveau de dock et par tick.",
  liftEnergyPerUnit: "Énergie consommée au sol par unité hissée en orbite.",
};

/** Scalaires d'équilibrage (`packages/shared/src/balance.ts`) au format `ContentConstant`. */
function seedConstants(): ContentConstant[] {
  return (Object.keys(DEFAULT_BALANCE) as (keyof BalanceConstants)[]).map((key) => ({
    key,
    value: DEFAULT_BALANCE[key],
    descriptionFr: SEED_CONSTANT_LABELS[key],
  }));
}

/**
 * Libellés français des techs, dupliqués depuis `apps/web/src/labels.ts` (`TECH_LABELS`)
 * — même raison que `SEED_WARSHIP_LABELS` ci-dessus.
 */
const SEED_TECH_LABELS: Record<string, { name: string; description: string }> = {
  metallurgy: {
    name: "Métallurgie",
    description: "Les premiers hauts-fourneaux orbitaux. Débloque la fonderie.",
  },
  industrial_chains: {
    name: "Chaînes industrielles",
    description:
      "Standardisation des lignes d'assemblage. Débloque usines de composants et de biens.",
  },
  advanced_mining: {
    name: "Extraction avancée",
    description: "Foreuses à plasma auto-répliquantes. Production des mines +25 %.",
  },
  fusion_power: {
    name: "Fusion contrôlée",
    description: "Le deutérium des océans alimente les réacteurs. Centrales +30 %.",
  },
  automation: {
    name: "Automatisation",
    description: "Les machines ne dorment jamais. Toute production +10 %.",
  },
  orbital_logistics: {
    name: "Logistique orbitale",
    description: "Docks en orbite basse. Débloque le dock orbital, convois 30 % plus rapides.",
  },
  space_elevator: {
    name: "Ascenseur spatial",
    description:
      "Un ruban jusqu'à l'orbite. Débit +80 %, capacité +40 %, carburant des convois −20 %. Débloque le transporteur.",
  },
  astro_cartography: {
    name: "Cartographie stellaire",
    description: "Interféromètres longue portée. Sondes 40 % plus rapides.",
  },
  autonomous_probes: {
    name: "Sondes autonomes",
    description: "Essaims auto-assemblés à bas coût. Coût des sondes −60 %.",
  },
  colonial_engineering: {
    name: "Génie colonial",
    description: "Coques modulaires à déploiement rapide. Vaisseaux coloniaux 30 % plus rapides.",
  },
  habitat_engineering: {
    name: "Habitats étendus",
    description: "Dômes pressurisés de nouvelle génération. Logements +25 %.",
  },
  light_terraforming: {
    name: "Terraformation légère",
    description: "Régulation atmosphérique locale. Habitabilité effective +10.",
  },
  orbital_construction: {
    name: "Construction orbitale",
    description: "Chantiers en apesanteur. +1 emplacement dans la file de construction.",
  },
  gateway_engineering: {
    name: "Ingénierie des portails",
    description:
      "Dompter les ancrages stables détectés en bord de galaxie. Débloque les chantiers de portail inter-galactique.",
  },
  civic_planning: {
    name: "Urbanisme",
    description: "Des villes pensées pour vivre, pas survivre. Satisfaction +5.",
  },
  education_networks: {
    name: "Réseaux éducatifs",
    description: "Le savoir circule plus vite que la lumière locale. Laboratoires +25 %.",
  },
  colonial_medicine: {
    name: "Médecine coloniale",
    description: "Cliniques adaptées aux biosphères hostiles. Croissance démographique +30 %.",
  },
  cultural_media: {
    name: "Médias culturels",
    description: "Le divertissement voyage en ansible. Besoin en biens −30 %.",
  },
  tax_reform: {
    name: "Réforme fiscale",
    description: "Une bureaucratie presque indolore. Crédits +30 %.",
  },
  governance_ai: {
    name: "IA de gouvernance",
    description: "Elle optimise tout, discrètement. Production et croissance +10 %.",
  },
  military_doctrine: {
    name: "Doctrine militaire",
    description: "Premiers arsenaux de guerre. Débloque chasseurs et frégates.",
  },
  fleet_logistics: {
    name: "Logistique de flotte",
    description: "Coordination des escadres. Débloque les vaisseaux de soutien.",
  },
  capital_ships: {
    name: "Vaisseaux capitaux",
    description: "Les chantiers assemblent des croiseurs lourds.",
  },
  ore_processing: {
    name: "Traitement du minerai",
    description: "Concassage et tri sur site. Mines +15 %, avant-postes +40 %, stockage +25 %.",
  },
  modular_construction: {
    name: "Construction modulaire",
    description: "Des modules préfabriqués en orbite. Chantiers 25 % plus rapides, navals 20 %.",
  },
  heavy_industry: {
    name: "Industrie lourde",
    description: "Complexes métallurgiques intégrés. Fonderies +30 %, composants +25 %.",
  },
  nanofabrication: {
    name: "Nanofabrication",
    description: "L'assemblage atome par atome. Toute production +15 %, chantiers −15 %.",
  },
  deep_survey: {
    name: "Sondage profond",
    description: "Balises jetables en essaim. Sondes 30 % plus rapides et 30 % moins chères.",
  },
  arcology_design: {
    name: "Arcologies",
    description: "Des villes-mondes verticales et vivables. Logements +30 %, satisfaction +3.",
  },
  deep_terraforming: {
    name: "Terraformation profonde",
    description: "Remodeler une biosphère entière. Habitabilité +12, croissance +10 %.",
  },
  agro_synthesis: {
    name: "Agro-synthèse",
    description: "Protéines cultivées en cuve. Besoin en nourriture −30 %, fermes +20 %.",
  },
  civic_archives: {
    name: "Archives civiques",
    description: "Une mémoire commune qui fait nation. Influence +40 %.",
  },
  trade_charters: {
    name: "Chartes commerciales",
    description:
      "Des couloirs marchands protégés. Crédits +20 %, convois 15 % plus rapides, marge en station +8 %.",
  },
  point_defense: {
    name: "Défense rapprochée",
    description: "Tourelles à tir rapide. Débloque la corvette d'escorte.",
  },
  strike_doctrine: {
    name: "Doctrine de frappe",
    description: "Frapper loin, avant d'être vu. Débloque le bombardier de ligne.",
  },
  dreadnoughts: {
    name: "Cuirassés",
    description: "Des forteresses mobiles qui décident d'une guerre. Débloque le cuirassé.",
  },
  plasma_weapons: {
    name: "Armement plasma",
    description: "Canons à plasma confiné. Débloque le canon plasma, puissant à toute portée.",
  },
  reactive_armor: {
    name: "Blindage réactif",
    description: "Plaques auto-réactives absorbant l'impact. Débloque le blindage réactif.",
  },
  graviton_thrusters: {
    name: "Propulsion à graviton",
    description: "Manipulation locale de la gravité. Débloque le propulseur à graviton.",
  },
  xeno_survey: {
    name: "Prospection xéno",
    description:
      "Cartographie des confins inexplorés. Débloque l'éclaireur lointain et la foreuse à noyau.",
  },
};

/** Techs historiques (`packages/shared`) au format `ContentTech`. */
function seedTechs(): ContentTech[] {
  return TECH_IDS.map((id) => {
    const def = TECHS[id];
    const label = SEED_TECH_LABELS[id];
    return {
      id,
      nameFr: label?.name ?? id,
      descriptionFr: label?.description ?? "",
      branch: def.branch,
      cost: def.cost,
      durationMs: def.durationMs,
      requires: [...def.requires],
      effects: def.effects,
    };
  });
}

/**
 * Libellés français des châssis, dupliqués depuis `apps/web/src/labels.ts`
 * (`CHASSIS_LABELS`) — même raison que `SEED_WARSHIP_LABELS` ci-dessus.
 */
const SEED_CHASSIS_LABELS: Record<string, { name: string; description: string }> = {
  scout_frame: { name: "Éclaireur", description: "Coque légère polyvalente, vive et sobre." },
  standard_hull: { name: "Coque standard", description: "Généraliste équilibrée, deux armes." },
  warframe: { name: "Cadre de guerre", description: "Militaire : +15 % dégâts, trois armes." },
  battlecruiser: {
    name: "Croiseur de bataille",
    description: "Colossal : +20 % dégâts, +10 % défense, quatre armes.",
  },
  light_freighter: { name: "Cargo léger", description: "Civil : +20 % soute, coque nue." },
  heavy_freighter: {
    name: "Soutier lourd",
    description: "Civil : +50 % soute, quatre utilitaires.",
  },
  mining_barge: { name: "Barge minière", description: "Extraction : +60 % rendement de minage." },
  colony_ark: {
    name: "Arche coloniale",
    description: "Colonisation : +30 % habitat, gros vaisseau.",
  },
  explorer_frame: {
    name: "Éclaireur lointain",
    description: "Prospection : +30 % senseurs, +15 % minage, deux propulseurs.",
  },
};

/** Châssis historiques (`packages/shared`) au format `ContentChassis`. */
function seedChassis(): ContentChassis[] {
  return CHASSIS_IDS.map((id) => {
    const def = CHASSIS[id];
    const label = SEED_CHASSIS_LABELS[id];
    return {
      id,
      nameFr: label?.name ?? id,
      descriptionFr: label?.description ?? "",
      kind: def.kind,
      domain: def.domain,
      hull: def.hull,
      baseInitiative: def.baseInitiative,
      power: def.power,
      tonnage: def.tonnage,
      calc: def.calc,
      slots: def.slots,
      baseSpeedMult: def.baseSpeedMult,
      baseFuelPerJump: def.baseFuelPerJump,
      roleBonus: def.roleBonus ?? null,
      cost: def.cost,
      buildMs: def.buildMs,
      requiresTech: def.requiresTech ?? null,
    };
  });
}

/**
 * Libellés français des modules, dupliqués depuis `apps/web/src/labels.ts`
 * (`MODULE_LABELS`) — même raison que `SEED_WARSHIP_LABELS` ci-dessus.
 */
const SEED_MODULE_LABELS: Record<string, { name: string; description: string }> = {
  laser_pulse: { name: "Laser à impulsion", description: "Arme de mêlée (court)." },
  autocannon: { name: "Canon automatique", description: "Arme à moyenne portée." },
  railgun: { name: "Railgun", description: "Arme longue portée, perforante." },
  missile_battery: { name: "Batterie de missiles", description: "Frappe très longue portée." },
  armor_plating: { name: "Blindage", description: "+60 points de coque." },
  deflector_shield: { name: "Bouclier déflecteur", description: "+30 boucliers." },
  aegis_shield: { name: "Bouclier Aegis", description: "+70 boucliers." },
  ion_thruster: { name: "Propulseur ionique", description: "+vitesse, un peu de carburant." },
  warp_drive: { name: "Distorseur", description: "+vitesse forte, carburant élevé." },
  ramscoop: { name: "Collecteur Bussard", description: "+vitesse légère, carburant réduit." },
  cargo_pod: { name: "Module de soute", description: "+150 de capacité." },
  cargo_hold_xl: { name: "Cale XL", description: "+450 de capacité." },
  mining_laser: { name: "Laser de minage", description: "+40 rendement d'extraction." },
  habitat_pod: { name: "Module d'habitat", description: "Rend le vaisseau colonisateur." },
  fleet_uplink: { name: "Liaison de flotte", description: "+12 % dégâts de flotte (soutien)." },
  sensor_array: { name: "Réseau de senseurs", description: "+4 initiative." },
  plasma_cannon: { name: "Canon plasma", description: "Arme puissante à toute portée." },
  reactive_plating: { name: "Blindage réactif", description: "+120 points de coque." },
  graviton_engine: {
    name: "Propulseur à graviton",
    description: "+vitesse forte, sobre en carburant.",
  },
  deep_core_drill: { name: "Foreuse à noyau", description: "+80 rendement d'extraction." },
};

/** Modules historiques (`packages/shared`) au format `ContentModule`. */
function seedModules(): ContentModule[] {
  return MODULE_IDS.map((id) => {
    const def = MODULES[id];
    const label = SEED_MODULE_LABELS[id];
    return {
      id,
      nameFr: label?.name ?? id,
      descriptionFr: label?.description ?? "",
      slot: def.slot,
      role: def.role,
      power: def.power,
      tonnage: def.tonnage,
      calc: def.calc,
      cost: def.cost,
      buildMs: def.buildMs,
      requiresTech: def.requiresTech ?? null,
      effects: def.effects,
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
  if ((await repo.countConstants()) === 0) {
    await repo.insertConstants(seedConstants());
  }
  if ((await repo.countTechs()) === 0) {
    await repo.insertTechs(seedTechs());
  }
  if ((await repo.countChassis()) === 0) {
    await repo.insertChassis(seedChassis());
  }
  if ((await repo.countModules()) === 0) {
    await repo.insertModules(seedModules());
  }
}

/** Charge tout le contenu depuis la DB — appelé au boot puis après chaque édition admin
 *  (remplacement en bloc de `GameRuntime.content`, jamais de mutation en place). */
export async function loadContentBundle(): Promise<ContentBundle> {
  const [warships, combatTuning, factions, buildings, ships, constants, techs, chassis, modules] =
    await Promise.all([
      repo.loadWarships(),
      repo.loadTuning(),
      repo.loadFactions(),
      repo.loadBuildings(),
      repo.loadShips(),
      repo.loadConstants(),
      repo.loadTechs(),
      repo.loadChassis(),
      repo.loadModules(),
    ]);
  return {
    warships,
    combatTuning,
    factions,
    buildings,
    ships,
    constants,
    techs,
    chassis,
    modules,
  };
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

/** Convertit les constantes chargées en `BalanceConstants` (défaut `DEFAULT_BALANCE` par
 *  champ manquant — ne devrait arriver qu'avant le premier `ensureContentSeeded()`). */
export function balanceFromContent(constants: Record<string, ContentConstant>): BalanceConstants {
  const result = { ...DEFAULT_BALANCE };
  for (const key of Object.keys(DEFAULT_BALANCE) as (keyof BalanceConstants)[]) {
    const value = constants[key]?.value;
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** Convertit les techs chargées en table de définitions (`sim/empire/research.ts`
 *  `computeEffects`/`canResearch`, `sim/empire/techtree.ts` `researchPath`/`validateTree`)
 *  — même forme que `TECHS`, sourcée depuis le contenu DB-backed. */
export function techDefsFromContent(techs: Record<string, ContentTech>): Record<string, TechDef> {
  return Object.fromEntries(
    Object.entries(techs).map(([id, t]) => [
      id,
      {
        id: id as TechDef["id"],
        branch: t.branch as TechDef["branch"],
        cost: t.cost,
        durationMs: t.durationMs,
        requires: t.requires as TechDef["requires"],
        effects: t.effects,
      } satisfies TechDef,
    ]),
  );
}

/** Convertit les châssis chargés en table de définitions (`sim/industry/design.ts`
 *  `resolveBlueprint`/`validateBlueprint`) — même forme que `CHASSIS`, sourcée depuis
 *  le contenu DB-backed. */
export function chassisDefsFromContent(
  chassis: Record<string, ContentChassis>,
): Record<string, ChassisDef> {
  return Object.fromEntries(
    Object.entries(chassis).map(([id, c]) => [
      id,
      {
        id: id as ChassisDef["id"],
        kind: c.kind as ChassisDef["kind"],
        domain: c.domain as ChassisDef["domain"],
        hull: c.hull,
        baseInitiative: c.baseInitiative,
        power: c.power,
        tonnage: c.tonnage,
        calc: c.calc,
        slots: c.slots as ChassisDef["slots"],
        baseSpeedMult: c.baseSpeedMult,
        baseFuelPerJump: c.baseFuelPerJump,
        roleBonus: (c.roleBonus ?? undefined) as ChassisDef["roleBonus"],
        cost: c.cost,
        buildMs: c.buildMs,
        requiresTech: (c.requiresTech ?? undefined) as ChassisDef["requiresTech"],
      } satisfies ChassisDef,
    ]),
  );
}

/** Convertit les modules chargés en table de définitions (`sim/industry/design.ts`
 *  `resolveBlueprint`/`validateBlueprint`) — même forme que `MODULES`, sourcée depuis
 *  le contenu DB-backed. */
export function moduleDefsFromContent(
  modules: Record<string, ContentModule>,
): Record<string, ModuleDef> {
  return Object.fromEntries(
    Object.entries(modules).map(([id, m]) => [
      id,
      {
        id: id as ModuleDef["id"],
        slot: m.slot as ModuleDef["slot"],
        role: m.role as ModuleDef["role"],
        power: m.power,
        tonnage: m.tonnage,
        calc: m.calc,
        cost: m.cost,
        buildMs: m.buildMs,
        requiresTech: (m.requiresTech ?? undefined) as ModuleDef["requiresTech"],
        effects: m.effects,
      } satisfies ModuleDef,
    ]),
  );
}

export { ContentRepository };
