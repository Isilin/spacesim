import type {
  BuildingId,
  CombatDirective,
  FactionId,
  FactionMood,
  PlanetType,
  ResourceId,
  ShipId,
  TechBranch,
  TechId,
  WarshipId,
} from "@spacesim/shared";

/** Humeur de faction (chantier 15) : nom + ton d'affichage (neutre/positif/négatif). */
export const FACTION_MOOD_LABELS: Record<FactionMood, { name: string; tone: "muted" | "ok" | "ko" }> = {
  neutral: { name: "Calme", tone: "muted" },
  boom: { name: "Essor — achats bonifiés", tone: "ok" },
  shortage: { name: "Pénurie — contrat en cours", tone: "ok" },
  embargo: { name: "Embargo — commerce fermé aux inconnus", tone: "ko" },
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
  habitat: { name: "Habitat", description: "20 logements par niveau (modulés par l'habitabilité)." },
  storage_depot: { name: "Entrepôt", description: "+1000 de stockage par niveau." },
  laboratory: { name: "Laboratoire", description: "Produit de la science, consomme de l'énergie." },
  smelter: { name: "Fonderie", description: "Minerai + énergie → métaux." },
  component_factory: { name: "Usine de composants", description: "Métaux + énergie → composants." },
  goods_factory: { name: "Usine de biens", description: "Métaux + énergie → biens de consommation." },
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

export const SHIP_LABELS: Record<ShipId, { name: string; description: string }> = {
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

/** Description étendue par faction — le nom canonique vit dans `content/factions.ts` (shared). */
export const FACTION_DESCRIPTIONS: Record<FactionId, string> = {
  ferride: "Forges orbitales et chaînes de montage. Vend le métal, paie cher les vivres.",
  ostara_league: "Les greniers de la galaxie. Vend nourriture et biens, achète l'industrie.",
  aether_cartel: "Réacteurs, minerai brut et discrétion. Vend l'énergie, achète le raffiné.",
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

export const DIRECTIVE_LABELS: Record<CombatDirective, { name: string; hint: string }> = {
  barrage: { name: "Barrage", hint: "+35 % dégâts, défense affaiblie. Écrase l'évitement." },
  shields: { name: "Boucliers renforcés", hint: "Défense max, dégâts réduits. Encaisse le barrage." },
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
    description: "Standardisation des lignes d'assemblage. Débloque usines de composants et de biens.",
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
    description:
      "Concassage et tri sur site. Mines +15 %, avant-postes +40 %, stockage +25 %.",
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
};
