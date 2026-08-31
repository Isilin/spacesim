/** Durée d'un tick de simulation, en ms. */
export const TICK_MS = 5000;

/** Catch-up hors-ligne borné : au-delà, le temps est perdu (évite de rejouer des semaines). */
export const MAX_CATCHUP_TICKS = (24 * 3600 * 1000) / TICK_MS;

/** Dimensions de la carte galaxie (viewBox SVG) — espace de coordonnées interne à une galaxie. */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 700;
/**
 * Épaisseur de la couche de systèmes dans une galaxie (chantier 31.2). Volontairement
 * très inférieure à `MAP_WIDTH`/`MAP_HEIGHT` : une galaxie est un disque, pas un cube.
 * Les systèmes sont centrés sur `z = 0`, le plan galactique.
 */
export const MAP_DEPTH = 200;

/**
 * Carte univers (chantier 9) : les galaxies sont posées sur une spirale d'angle d'or
 * autour de ce centre, sans borne — la vue se déplace et se zoome (`ZoomableSvg`).
 */
export const UNIVERSE_CENTER_X = MAP_WIDTH / 2;
export const UNIVERSE_CENTER_Y = MAP_HEIGHT / 2;
/** Écart moyen entre deux galaxies voisines sur la spirale. */
export const GALAXY_SPACING = 260;

/**
 * Normalisation du coût de trajet (chantier 31.6) : une arête pèse sa longueur 3D
 * divisée par cette référence. Calée sur la longueur d'arête **moyenne** d'un univers
 * généré (mesurée : moyenne 205, médiane 198, étendue 96-388) pour que l'arête typique
 * vaille ≈ 1 — la valeur retournée reste ainsi à l'échelle du compte de sauts d'avant,
 * et les constantes de `balance.ts` qui la multiplient gardent leur ordre de grandeur.
 */
export const JUMP_REFERENCE_LENGTH = 205;

/**
 * Poids d'un saut de portail inter-galactique, forfaitaire (chantier 31.6). Sa longueur
 * réelle se compte en centaines de milliers d'unités : la facturer rendrait toute
 * galaxie voisine inatteignable. Le prix du passage est porté par `gatewayTollCredits`,
 * pas par la distance. À 1, le barème d'avant le chantier 31 est préservé.
 */
export const GATEWAY_JUMP_WEIGHT = 1;

/**
 * Normalisation du coût intra-système (chantier 31.8). Très supérieure à
 * `JUMP_REFERENCE_LENGTH` à dessein : traverser un système doit rester une fraction du
 * prix d'un saut interstellaire, jamais son équivalent.
 *
 * **Confirmée au chantier 31.9** par mesure : sur 254 paires de corps colonisables,
 * attendre la conjonction fait gagner 21 % de la durée de transfert en médiane (10 % au
 * minimum, 46 % au maximum). Assez pour que le moment du départ soit une décision, pas
 * assez pour transformer le jeu en jeu d'attente — ce que la conception a explicitement
 * écarté en préférant des orbites simulées aux fenêtres de transfert.
 *
 * Verrou : `orbits.calibration.test.ts`.
 */
export const INTRA_SYSTEM_REFERENCE_LENGTH = 2000;
/**
 * Amplitude verticale du disque d'univers (chantier 31.2). L'écart au plan décroît avec
 * le rayon : bulbe épais au centre, disque mince vers la périphérie.
 */
export const UNIVERSE_DISC_THICKNESS = 90;

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

/**
 * Constantes de Kepler simplifié (chantier 31.5) : `ω = K / r^1.5` radians par tick.
 *
 * **Calibrées au chantier 31.9**, sur mesure d'un univers généré. La grandeur qui
 * gouverne la mécanique n'est pas la période d'une planète mais la période
 * **synodique** d'une paire — le temps entre deux conjonctions : médiane 19,5 h
 * (q25 8 h, q75 37 h). Volontairement non commensurable avec 24 h, sans quoi un joueur
 * jouant toujours à la même heure verrait toujours la même configuration.
 *
 * Périodes orbitales correspondantes, à `TICK_MS = 5000` : de 5 h pour l'orbite la plus
 * interne à 53 h pour la plus externe, médiane 15 h. Le rapport à la durée d'un
 * transfert (dizaines de secondes) garantit qu'un ETA annoncé au départ reste exact.
 *
 * Verrou : `orbits.calibration.test.ts`.
 */
export const PLANET_KEPLER_CONSTANT = 0.8517;
export const MOON_KEPLER_CONSTANT = 0.2792;

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

/**
 * Pénalité de recherche appliquée à un portail quand le joueur demande l'itinéraire
 * qui en emprunte le moins (chantier 31.10). Grande devant un trajet ordinaire (~3
 * équivalents-sauts) pour dominer le critère, mais finie : si la seule route passe par
 * un portail, elle reste trouvée. N'entre JAMAIS dans le prix affiché — le chemin est
 * retarifé au coût réel.
 */
export const GATE_AVOIDANCE_PENALTY = 1000;

/**
 * Pénalité de recherche par système hostile traversé, pour l'itinéraire « le plus sûr »
 * (chantier 31.10). Du même ordre qu'un trajet moyen : contourner vaut la peine, mais
 * traverser reste possible quand le détour coûterait plus cher que le risque. Comme
 * ci-dessus, jamais facturée au joueur.
 */
export const HOSTILE_SYSTEM_PENALTY = 3;

/**
 * Bornes du journal d'événements d'empire (chantier 32.1). C'est le seul objet du
 * snapshot qui croît sans jamais décroître avec le temps de jeu, dans un univers qui ne
 * se réinitialise jamais — d'où deux bornes plutôt qu'une.
 *
 * `KEEP` : au-delà, les plus anciens événements **déjà lus** sont purgés de la base. Les
 * non-lus ne le sont jamais : ce sont exactement ceux que le joueur absent doit
 * retrouver. `PAGE` : ce que le snapshot transporte à chaque tick — un joueur revenu
 * après trois semaines n'a pas besoin de deux cents lignes par tick pour comprendre
 * qu'il s'est fait attaquer. Le compteur de non-lus, lui, porte sur le total.
 */
export const EMPIRE_EVENT_KEEP = 200;
export const EMPIRE_EVENT_PAGE = 50;
