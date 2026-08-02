/** Durée d'un tick de simulation, en ms. */
export const TICK_MS = 5000;

/** Catch-up hors-ligne borné : au-delà, le temps est perdu (évite de rejouer des semaines). */
export const MAX_CATCHUP_TICKS = (24 * 3600 * 1000) / TICK_MS;

/** Dimensions de la carte galaxie (viewBox SVG) — espace de coordonnées interne à une galaxie. */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 700;

/**
 * Carte univers (chantier 9) : les galaxies sont posées sur une spirale d'angle d'or
 * autour de ce centre, sans borne — la vue se déplace et se zoome (`ZoomableSvg`).
 */
export const UNIVERSE_CENTER_X = MAP_WIDTH / 2;
export const UNIVERSE_CENTER_Y = MAP_HEIGHT / 2;
/** Écart moyen entre deux galaxies voisines sur la spirale. */
export const GALAXY_SPACING = 260;

/** Galaxies générées pour une partie neuve : la galaxie d'origine + la frontière vierge. */
export const INITIAL_GALAXIES = 4;
/** Galaxies vierges de toute colonie maintenues en permanence au-delà du front de peuplement. */
export const FRONTIER_GALAXIES = 3;
/** Empires accueillis par galaxie de départ avant d'en ouvrir une autre. */
export const MAX_EMPIRES_PER_GALAXY = 4;
/** Garde-fou : au-delà, on cesse d'étendre l'univers (mémoire du serveur). */
export const MAX_GALAXIES = 200;

/** Dimension de la vue système (viewBox SVG carré, étoile au centre). */
export const SYSTEM_VIEW_SIZE = 900;

/** Capacité de stockage de base par ressource, + bonus par niveau d'entrepôt. */
export const BASE_STORAGE = 1000;
export const STORAGE_PER_DEPOT = 1000;

/** Ressources non plafonnées par le stockage. */
export const UNCAPPED_RESOURCES = ["credits", "science"] as const;

/** Taille max de la file de construction (extensible par tech plus tard). */
export const MAX_QUEUE_LENGTH = 3;

/** Modificateur de gisement quand la planète n'en a pas pour la ressource extraite. */
export const NO_DEPOSIT_MODIFIER = 0.5;

/** Nourriture consommée par colon et par tick. */
export const FOOD_PER_COLONIST = 0.05;

/** Logements fournis par niveau d'habitat. */
export const HOUSING_PER_HABITAT = 20;

/** Impôt : crédits par colon et par tick, pondéré par la satisfaction. */
export const CREDITS_PER_COLONIST = 0.02;

/**
 * Croissance de base par tick à satisfaction max, loin du plafond de population
 * (logistique : ralentit près du plafond, négative sous 50 de satisfaction).
 */
export const POP_GROWTH_BASE = 0.003;

/** En-dessous de ce seuil de satisfaction, la population décline. */
export const SATISFACTION_GROWTH_THRESHOLD = 50;

/** Biens de consommation par colon et par tick (manque toléré : pèse sur la satisfaction). */
export const GOODS_PER_COLONIST = 0.02;

/** Fraction des ressources d'une colonie pillée lors d'un raid PvP réussi (chantier 7d). */
export const RAID_FRACTION = 0.25;

/** Convois cargo : temps et coût selon la distance en sauts. */
export const TRANSFER_BASE_MS = 30_000;
export const TRANSFER_MS_PER_JUMP = 60_000;
export const TRANSFER_BASE_CREDITS = 5;
export const TRANSFER_CREDITS_PER_JUMP = 5;

/** Carburant lié à la masse transportée, par unité et par saut (chantier 12). */
export const FUEL_PER_MASS_JUMP = 0.03;
/** Péage prélevé à chaque portail inter-galactique emprunté par un convoi. */
export const GATEWAY_TOLL_CREDITS = 60;

/** Sonde : révèle les planètes d'un système. */
export const PROBE_COST_CREDITS = 25;
export const PROBE_BASE_MS = 20_000;
export const PROBE_MS_PER_JUMP = 30_000;

/** Vaisseau colonial : coût élevé (gaté par la chaîne composants) + trajet. */
export const COLONY_SHIP_COST = {
  components: 40,
  food: 50,
  credits: 100,
} as const;
export const COLONY_SHIP_BASE_MS = 60_000;
export const COLONY_SHIP_MS_PER_JUMP = 90_000;

/** Dotation d'une colonie fondée par vaisseau colonial. */
export const NEW_COLONY_POPULATION = 10;
export const NEW_COLONY_RESOURCES = {
  ore: 100,
  energy: 50,
  food: 100,
} as const;
/** Soute orbitale léguée par le vaisseau colonial démantelé (chantier 12). */
export const NEW_COLONY_ORBITAL = { ore: 40 } as const;

/**
 * Couche orbitale (chantier 12) : les vaisseaux ne chargent qu'en orbite. Le dock
 * orbital fixe à la fois ce qu'on peut y entreposer et le débit de l'ascenseur.
 */
export const ORBITAL_CAP_PER_DOCK = 600;
/** Unités hissées (ou redescendues) par tick et par dock. */
export const LIFT_PER_DOCK = 15;
/** Énergie consommée au sol par unité hissée — monter coûte, redescendre est gratuit. */
export const LIFT_ENERGY_PER_UNIT = 0.04;

/**
 * Station orbitale (chantier 24) : coût de fondation + trajet, sur le modèle du
 * vaisseau colonial — pas de coût d'influence (une station ne revendique rien,
 * contrairement à `colonize`, ça reste le rôle des `claims`).
 */
export const STATION_SHIP_COST = {
  metals: 200,
  components: 80,
  credits: 150,
} as const;
export const STATION_SHIP_BASE_MS = 60_000;
export const STATION_SHIP_MS_PER_JUMP = 90_000;
