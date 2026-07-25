import type {
  BuildingId,
  ChassisId,
  CombatDirective,
  FactionId,
  FactionMood,
  LegacyShipId,
  ModuleId,
  ModuleRole,
  ObjectiveKind,
  PlanetType,
  RelationState,
  ResourceId,
  SlotType,
  TechBranch,
  TechId,
  WarshipId,
  WorldEventKind,
} from "@spacesim/shared";

/** Humeur de faction (chantier 15) : nom + ton d'affichage (neutre/positif/négatif). */
export const FACTION_MOOD_LABELS: Record<
  FactionMood,
  { name: string; tone: "muted" | "ok" | "ko" }
> = {
  neutral: { name: "Calme", tone: "muted" },
  boom: { name: "Essor — achats bonifiés", tone: "ok" },
  shortage: { name: "Pénurie — contrat en cours", tone: "ok" },
  embargo: { name: "Embargo — commerce fermé aux inconnus", tone: "ko" },
};

/** Badge de relation diplomatique (chantier 16), affiché à côté du nom d'un empire. */
export const RELATION_BADGES: Record<RelationState, string> = {
  neutral: "",
  nap: " 🤝 pacte de non-agression",
  alliance: " ⭐ allié",
  war: " ⚔ en guerre",
};

/** Objectif éphémère (chantier 17), affiché dans le fil du monde. */
export const OBJECTIVE_KIND_LABELS: Record<ObjectiveKind, string> = {
  colonize_n_systems: "Coloniser de nouveaux systèmes",
  hold_system: "Défendre un système revendiqué",
  lead_population: "Mener le classement de population",
  lead_influence: "Mener le classement d'influence",
};

/** Événement de monde (chantier 17), affiché dans le fil du monde. */
export const WORLD_EVENT_LABELS: Record<
  WorldEventKind,
  { name: string; icon: string; tone: "ok" | "ko" }
> = {
  economic_crisis: { name: "Crise économique", icon: "📉", tone: "ko" },
  gold_rush: { name: "Ruée vers l'or", icon: "💰", tone: "ok" },
  pirate_surge: { name: "Vague pirate", icon: "☠", tone: "ko" },
  faction_boom: { name: "Essor de faction", icon: "📈", tone: "ok" },
};

export const PLANET_TYPE_LABELS: Record<PlanetType, string> = {
  telluric: "Tellurique",
  oceanic: "Océanique",
  volcanic: "Volcanique",
  frozen: "Glacée",
  arid: "Aride",
  gas: "Gazeuse",
};

export const RESOURCE_LABELS: Record<ResourceId, string> = {
  energy: "Énergie",
  ore: "Minerai",
  metals: "Métaux",
  components: "Composants",
  food: "Nourriture",
  goods: "Biens",
  credits: "Crédits",
  science: "Science",
};

export const BUILDING_LABELS: Record<BuildingId, { name: string; description: string }> = {
  mine: { name: "Mine", description: "Extrait le minerai (selon gisement)." },
  power_plant: { name: "Centrale", description: "Produit de l'énergie (selon gisement)." },
  farm: { name: "Ferme", description: "Produit de la nourriture (selon gisement)." },
  habitat: {
    name: "Habitat",
    description: "20 logements par niveau (modulés par l'habitabilité).",
  },
  storage_depot: { name: "Entrepôt", description: "+1000 de stockage par niveau." },
  laboratory: { name: "Laboratoire", description: "Produit de la science, consomme de l'énergie." },
  smelter: { name: "Fonderie", description: "Minerai + énergie → métaux." },
  component_factory: { name: "Usine de composants", description: "Métaux + énergie → composants." },
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

/** Paliers de réputation, du plus haut au plus bas (aligné sur REP_TIERS). */
export const REP_TIER_LABELS = [
  { min: 800, name: "Allié" },
  { min: 300, name: "Partenaire" },
  { min: 100, name: "Associé" },
  { min: 0, name: "Neutre" },
] as const;

export function repTierName(rep: number): string {
  return REP_TIER_LABELS.find((t) => rep >= t.min)?.name ?? "Neutre";
}

export const SHIP_LABELS: Record<LegacyShipId, { name: string; description: string }> = {
  cargo_small: { name: "Cargo léger", description: "Soute de 200. Le mulet de l'espace." },
  cargo_large: {
    name: "Cargo lourd",
    description: "Soute de 600. Requiert la logistique orbitale.",
  },
  hauler: {
    name: "Transporteur",
    description: "Soute de 1800, lent et gourmand. Requiert l'ascenseur spatial.",
  },
  courier: {
    name: "Courrier",
    description: "Soute de 80, presque deux fois plus rapide et sobre en carburant.",
  },
};

/** Libellé d'un vaisseau par id (classe historique) ; repli sur l'id pour les plans. */
export function shipLabel(id: string): { name: string; description: string } {
  return SHIP_LABELS[id as LegacyShipId] ?? { name: id, description: "" };
}

/** Description étendue par faction — le nom canonique vit aussi dans `content/factions.ts` (shared). */
export const FACTION_LABELS: Record<FactionId, { name: string; description: string }> = {
  ferride: {
    name: "Consortium Ferride",
    description: "Forges orbitales et chaînes de montage. Vend le métal, paie cher les vivres.",
  },
  ostara_league: {
    name: "Ligue Agraire d'Ostara",
    description: "Les greniers de la galaxie. Vend nourriture et biens, achète l'industrie.",
  },
  aether_cartel: {
    name: "Cartel de l'Éther",
    description: "Réacteurs, minerai brut et discrétion. Vend l'énergie, achète le raffiné.",
  },
};

export const BRANCH_LABELS: Record<TechBranch, string> = {
  industry: "Industrie",
  colonization: "Colonisation",
  society: "Société",
  military: "Militaire",
};

export const WARSHIP_LABELS: Record<WarshipId, { name: string; description: string }> = {
  fighter: { name: "Chasseur", description: "Rapide, létal en mêlée. Domine les croiseurs." },
  frigate: { name: "Frégate", description: "Polyvalente à moyenne portée. Domine les chasseurs." },
  cruiser: { name: "Croiseur", description: "Lourd, longue portée. Domine les frégates." },
  support: { name: "Vaisseau de soutien", description: "Boucliers épais, +12 % dégâts de flotte." },
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

// ── Conception de vaisseaux (chantier 13) ──────────────────────────────────

export const SLOT_LABELS: Record<SlotType, string> = {
  weapon: "Arme",
  defense: "Défense",
  propulsion: "Propulsion",
  utility: "Utilitaire",
};

export const ROLE_LABELS: Record<ModuleRole, string> = {
  weapon: "Arme",
  defense: "Défense",
  propulsion: "Propulsion",
  cargo: "Soute",
  mining: "Extraction",
  habitat: "Habitat",
  support: "Soutien",
  sensor: "Senseur",
};

export const CHASSIS_LABELS: Record<ChassisId, { name: string; description: string }> = {
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

export const MODULE_LABELS: Record<ModuleId, { name: string; description: string }> = {
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

export const DIRECTIVE_LABELS: Record<CombatDirective, { name: string; hint: string }> = {
  barrage: { name: "Barrage", hint: "+35 % dégâts, défense affaiblie. Écrase l'évitement." },
  shields: {
    name: "Boucliers renforcés",
    hint: "Défense max, dégâts réduits. Encaisse le barrage.",
  },
  evasive: { name: "Manœuvre d'évitement", hint: "Esquive. Déborde les boucliers." },
  focus_fire: { name: "Tir concentré", hint: "Cible les gros vaisseaux d'abord. Neutre." },
};

export const TECH_LABELS: Record<TechId, { name: string; description: string }> = {
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
