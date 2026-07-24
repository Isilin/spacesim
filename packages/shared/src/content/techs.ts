import type { BuildingId } from "../types.js";

export type TechBranch = "industry" | "colonization" | "society" | "military";

export const TECH_IDS = [
  // Industrie
  "metallurgy",
  "industrial_chains",
  "advanced_mining",
  "fusion_power",
  "automation",
  "orbital_logistics",
  "ore_processing",
  "modular_construction",
  "heavy_industry",
  "nanofabrication",
  // Colonisation
  "astro_cartography",
  "autonomous_probes",
  "colonial_engineering",
  "habitat_engineering",
  "light_terraforming",
  "orbital_construction",
  "gateway_engineering",
  "deep_survey",
  "arcology_design",
  "deep_terraforming",
  // Société
  "civic_planning",
  "education_networks",
  "colonial_medicine",
  "cultural_media",
  "tax_reform",
  "governance_ai",
  "agro_synthesis",
  "civic_archives",
  "trade_charters",
  // Militaire
  "military_doctrine",
  "fleet_logistics",
  "capital_ships",
  "point_defense",
  "strike_doctrine",
  "dreadnoughts",
] as const;

export type TechId = (typeof TECH_IDS)[number];

/** Effets cumulables d'une tech (les mult se multiplient entre techs). */
export interface TechEffects {
  unlockBuildings?: BuildingId[];
  /** Multiplicateur de production d'un bâtiment précis. */
  outputMult?: Partial<Record<BuildingId, number>>;
  /** Multiplicateur de production de tous les bâtiments. */
  outputMultAll?: number;
  housingMult?: number;
  /** Bonus d'habitabilité effective (plafonné à 100). */
  habitabilityBonus?: number;
  /** Emplacements supplémentaires dans la file de construction. */
  queueBonus?: number;
  probeSpeedMult?: number;
  probeCostMult?: number;
  colonyShipSpeedMult?: number;
  transferSpeedMult?: number;
  satisfactionBonus?: number;
  popGrowthMult?: number;
  goodsNeedMult?: number;
  creditsMult?: number;
  /** Besoin en nourriture par colon (chantier 11). */
  foodNeedMult?: number;
  /** Capacité de stockage des colonies. */
  storageMult?: number;
  /** Durée de construction des bâtiments (< 1 = plus rapide). */
  buildSpeedMult?: number;
  /** Durée de production des vaisseaux civils. */
  shipBuildSpeedMult?: number;
  /** Rendement des avant-postes miniers. */
  outpostYieldMult?: number;
  /** Influence générée par tick. */
  influenceMult?: number;
}

export interface TechDef {
  id: TechId;
  branch: TechBranch;
  /** Coût en science (pool de l'empire). */
  cost: number;
  /** Durée de recherche en ms (timer réel). */
  durationMs: number;
  requires: TechId[];
  effects: TechEffects;
}

export const TECHS: Record<TechId, TechDef> = {
  // ─── Industrie ───
  metallurgy: {
    id: "metallurgy",
    branch: "industry",
    cost: 30,
    durationMs: 60_000,
    requires: [],
    effects: { unlockBuildings: ["smelter"] },
  },
  industrial_chains: {
    id: "industrial_chains",
    branch: "industry",
    cost: 80,
    durationMs: 120_000,
    requires: ["metallurgy"],
    effects: { unlockBuildings: ["component_factory", "goods_factory", "shipyard"] },
  },
  advanced_mining: {
    id: "advanced_mining",
    branch: "industry",
    cost: 120,
    durationMs: 180_000,
    requires: ["metallurgy"],
    effects: { outputMult: { mine: 1.25 } },
  },
  fusion_power: {
    id: "fusion_power",
    branch: "industry",
    cost: 220,
    durationMs: 240_000,
    requires: ["advanced_mining"],
    effects: { outputMult: { power_plant: 1.3 } },
  },
  automation: {
    id: "automation",
    branch: "industry",
    cost: 350,
    durationMs: 360_000,
    requires: ["industrial_chains"],
    effects: { outputMultAll: 1.1 },
  },
  orbital_logistics: {
    id: "orbital_logistics",
    branch: "industry",
    cost: 150,
    durationMs: 180_000,
    requires: ["industrial_chains"],
    effects: { transferSpeedMult: 0.7 },
  },
  ore_processing: {
    id: "ore_processing",
    branch: "industry",
    cost: 200,
    durationMs: 210_000,
    requires: ["advanced_mining"],
    effects: { outputMult: { mine: 1.15 }, outpostYieldMult: 1.4, storageMult: 1.25 },
  },
  modular_construction: {
    id: "modular_construction",
    branch: "industry",
    cost: 260,
    durationMs: 240_000,
    requires: ["industrial_chains", "orbital_construction"],
    effects: { buildSpeedMult: 0.75, shipBuildSpeedMult: 0.8 },
  },
  heavy_industry: {
    id: "heavy_industry",
    branch: "industry",
    cost: 480,
    durationMs: 420_000,
    requires: ["automation", "fusion_power"],
    effects: { outputMult: { smelter: 1.3, component_factory: 1.25 }, storageMult: 1.25 },
  },
  nanofabrication: {
    id: "nanofabrication",
    branch: "industry",
    cost: 900,
    durationMs: 600_000,
    requires: ["heavy_industry", "governance_ai"],
    effects: { outputMultAll: 1.15, buildSpeedMult: 0.85 },
  },
  // ─── Colonisation ───
  astro_cartography: {
    id: "astro_cartography",
    branch: "colonization",
    cost: 40,
    durationMs: 60_000,
    requires: [],
    effects: { probeSpeedMult: 0.6 },
  },
  autonomous_probes: {
    id: "autonomous_probes",
    branch: "colonization",
    cost: 90,
    durationMs: 120_000,
    requires: ["astro_cartography"],
    effects: { probeCostMult: 0.4 },
  },
  colonial_engineering: {
    id: "colonial_engineering",
    branch: "colonization",
    cost: 140,
    durationMs: 180_000,
    requires: ["astro_cartography"],
    effects: { colonyShipSpeedMult: 0.7 },
  },
  habitat_engineering: {
    id: "habitat_engineering",
    branch: "colonization",
    cost: 110,
    durationMs: 150_000,
    requires: [],
    effects: { housingMult: 1.25 },
  },
  light_terraforming: {
    id: "light_terraforming",
    branch: "colonization",
    cost: 320,
    durationMs: 300_000,
    requires: ["habitat_engineering"],
    effects: { habitabilityBonus: 10 },
  },
  orbital_construction: {
    id: "orbital_construction",
    branch: "colonization",
    cost: 180,
    durationMs: 210_000,
    requires: ["colonial_engineering"],
    effects: { queueBonus: 1 },
  },
  gateway_engineering: {
    id: "gateway_engineering",
    branch: "colonization",
    cost: 600,
    durationMs: 480_000,
    requires: ["orbital_construction", "light_terraforming"],
    // Pas d'effet passif : débloque les contributions au méga-projet de portail.
    effects: {},
  },
  deep_survey: {
    id: "deep_survey",
    branch: "colonization",
    cost: 210,
    durationMs: 210_000,
    requires: ["autonomous_probes"],
    effects: { probeSpeedMult: 0.7, probeCostMult: 0.7 },
  },
  arcology_design: {
    id: "arcology_design",
    branch: "colonization",
    cost: 380,
    durationMs: 330_000,
    requires: ["habitat_engineering", "civic_planning"],
    effects: { housingMult: 1.3, satisfactionBonus: 3 },
  },
  deep_terraforming: {
    id: "deep_terraforming",
    branch: "colonization",
    cost: 850,
    durationMs: 540_000,
    requires: ["light_terraforming", "heavy_industry"],
    effects: { habitabilityBonus: 12, popGrowthMult: 1.1 },
  },
  // ─── Société ───
  civic_planning: {
    id: "civic_planning",
    branch: "society",
    cost: 60,
    durationMs: 90_000,
    requires: [],
    effects: { satisfactionBonus: 5, unlockBuildings: ["monument"] },
  },
  education_networks: {
    id: "education_networks",
    branch: "society",
    cost: 100,
    durationMs: 120_000,
    requires: ["civic_planning"],
    effects: { outputMult: { laboratory: 1.25 } },
  },
  colonial_medicine: {
    id: "colonial_medicine",
    branch: "society",
    cost: 130,
    durationMs: 180_000,
    requires: ["civic_planning"],
    effects: { popGrowthMult: 1.3 },
  },
  cultural_media: {
    id: "cultural_media",
    branch: "society",
    cost: 160,
    durationMs: 210_000,
    requires: ["education_networks"],
    effects: { goodsNeedMult: 0.7 },
  },
  tax_reform: {
    id: "tax_reform",
    branch: "society",
    cost: 140,
    durationMs: 180_000,
    requires: ["education_networks"],
    effects: { creditsMult: 1.3 },
  },
  governance_ai: {
    id: "governance_ai",
    branch: "society",
    cost: 500,
    durationMs: 480_000,
    requires: ["cultural_media", "tax_reform"],
    effects: { outputMultAll: 1.1, popGrowthMult: 1.1 },
  },
  agro_synthesis: {
    id: "agro_synthesis",
    branch: "society",
    cost: 240,
    durationMs: 240_000,
    requires: ["colonial_medicine"],
    effects: { foodNeedMult: 0.7, outputMult: { farm: 1.2 } },
  },
  civic_archives: {
    id: "civic_archives",
    branch: "society",
    cost: 300,
    durationMs: 270_000,
    requires: ["education_networks"],
    effects: { influenceMult: 1.4 },
  },
  trade_charters: {
    id: "trade_charters",
    branch: "society",
    cost: 420,
    durationMs: 330_000,
    requires: ["tax_reform", "orbital_logistics"],
    effects: { creditsMult: 1.2, transferSpeedMult: 0.85 },
  },
  // ─── Militaire ─── (débloque les classes de vaisseaux de guerre, content/warships)
  military_doctrine: {
    id: "military_doctrine",
    branch: "military",
    cost: 90,
    durationMs: 120_000,
    requires: [],
    effects: {},
  },
  fleet_logistics: {
    id: "fleet_logistics",
    branch: "military",
    cost: 180,
    durationMs: 210_000,
    requires: ["military_doctrine"],
    effects: {},
  },
  capital_ships: {
    id: "capital_ships",
    branch: "military",
    cost: 350,
    durationMs: 360_000,
    requires: ["fleet_logistics"],
    effects: {},
  },
  point_defense: {
    id: "point_defense",
    branch: "military",
    cost: 200,
    durationMs: 210_000,
    requires: ["military_doctrine", "metallurgy"],
    // Débloque la corvette d'escorte (content/warships).
    effects: {},
  },
  strike_doctrine: {
    id: "strike_doctrine",
    branch: "military",
    cost: 360,
    durationMs: 300_000,
    requires: ["point_defense", "fleet_logistics"],
    // Débloque le bombardier de ligne.
    effects: {},
  },
  dreadnoughts: {
    id: "dreadnoughts",
    branch: "military",
    cost: 950,
    durationMs: 660_000,
    requires: ["capital_ships", "heavy_industry"],
    // Débloque le cuirassé.
    effects: {},
  },
};

/** Bâtiments disponibles sans tech (le reste est débloqué par l'arbre). */
export const BASE_BUILDINGS: BuildingId[] = [
  "mine",
  "power_plant",
  "farm",
  "habitat",
  "storage_depot",
  "laboratory",
];
