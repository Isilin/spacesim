/** Ressources i18n pour les tables de contenu de `labels.ts` (chantier 27.17) : ids stables
 *  définis dans `packages/shared` en clé, jamais le texte affiché — voir `labels.ts` pour les
 *  fonctions d'accès (`buildingLabel`, `techLabel`, etc.) qui résolvent ces clés via i18next. */

export const contentFr = {
  resource: {
    energy: "Énergie",
    ore: "Minerai",
    metals: "Métaux",
    components: "Composants",
    food: "Nourriture",
    goods: "Biens",
    credits: "Crédits",
    science: "Science",
  },
  planetType: {
    telluric: "Tellurique",
    oceanic: "Océanique",
    volcanic: "Volcanique",
    frozen: "Glacée",
    arid: "Aride",
    gas: "Gazeuse",
  },
  factionMood: {
    neutral: "Calme",
    boom: "Essor — achats bonifiés",
    shortage: "Pénurie — contrat en cours",
    embargo: "Embargo — commerce fermé aux inconnus",
  },
  relationBadge: {
    neutral: "",
    nap: " 🤝 pacte de non-agression",
    alliance: " ⭐ allié",
    war: " ⚔ en guerre",
  },
  objectiveKind: {
    colonize_n_systems: "Coloniser de nouveaux systèmes",
    hold_system: "Défendre un système revendiqué",
    lead_population: "Mener le classement de population",
    lead_influence: "Mener le classement d'influence",
  },
  worldEvent: {
    economic_crisis: { name: "Crise économique" },
    gold_rush: { name: "Ruée vers l'or" },
    pirate_surge: { name: "Vague pirate" },
    faction_boom: { name: "Essor de faction" },
  },
  repTier: {
    ally: "Allié",
    partner: "Partenaire",
    associate: "Associé",
    neutral: "Neutre",
  },
  branch: {
    industry: "Industrie",
    colonization: "Colonisation",
    society: "Société",
    military: "Militaire",
  },
  slot: {
    weapon: "Arme",
    defense: "Défense",
    propulsion: "Propulsion",
    utility: "Utilitaire",
  },
  role: {
    weapon: "Arme",
    defense: "Défense",
    propulsion: "Propulsion",
    cargo: "Soute",
    mining: "Extraction",
    habitat: "Habitat",
    support: "Soutien",
    sensor: "Senseur",
  },
  stationMarketAccess: {
    closed: {
      name: "Fermé",
      description: "Seul le propriétaire peut y commercer.",
    },
    alliance: { name: "Alliés", description: "Ouvert aux empires alliés." },
    nap: {
      name: "Pacte ou mieux",
      description:
        "Ouvert aux alliés et aux partenaires de pacte de non-agression.",
    },
    public: {
      name: "Public",
      description: "Ouvert à tout empire, sauf en guerre.",
    },
  },
  building: {
    mine: { name: "Mine", description: "Extrait le minerai (selon gisement)." },
    power_plant: {
      name: "Centrale",
      description: "Produit de l'énergie (selon gisement).",
    },
    farm: {
      name: "Ferme",
      description: "Produit de la nourriture (selon gisement).",
    },
    habitat: {
      name: "Habitat",
      description: "20 logements par niveau (modulés par l'habitabilité).",
    },
    storage_depot: {
      name: "Entrepôt",
      description: "+1000 de stockage par niveau.",
    },
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
    shipyard: {
      name: "Chantier naval",
      description: "Produit les vaisseaux civils (cargos).",
    },
    monument: {
      name: "Monument",
      description: "Rayonnement culturel : +0,5 influence par tick.",
    },
    orbital_dock: {
      name: "Dock orbital",
      description:
        "Entrepôt en orbite et ascenseur vers le sol. Indispensable : les vaisseaux ne chargent que ce qui est en orbite.",
    },
  },
  ship: {
    cargo_small: {
      name: "Cargo léger",
      description: "Soute de 200. Le mulet de l'espace.",
    },
    cargo_large: {
      name: "Cargo lourd",
      description: "Soute de 600. Requiert la logistique orbitale.",
    },
    hauler: {
      name: "Transporteur",
      description:
        "Soute de 1800, lent et gourmand. Requiert l'ascenseur spatial.",
    },
    courier: {
      name: "Courrier",
      description:
        "Soute de 80, presque deux fois plus rapide et sobre en carburant.",
    },
  },
  faction: {
    ferride: {
      name: "Consortium Ferride",
      description:
        "Forges orbitales et chaînes de montage. Vend le métal, paie cher les vivres.",
    },
    ostara_league: {
      name: "Ligue Agraire d'Ostara",
      description:
        "Les greniers de la galaxie. Vend nourriture et biens, achète l'industrie.",
    },
    aether_cartel: {
      name: "Cartel de l'Éther",
      description:
        "Réacteurs, minerai brut et discrétion. Vend l'énergie, achète le raffiné.",
    },
  },
  warship: {
    fighter: {
      name: "Chasseur",
      description: "Rapide, létal en mêlée. Domine les croiseurs.",
    },
    frigate: {
      name: "Frégate",
      description: "Polyvalente à moyenne portée. Domine les chasseurs.",
    },
    cruiser: {
      name: "Croiseur",
      description: "Lourd, longue portée. Domine les frégates.",
    },
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
  },
  chassis: {
    scout_frame: {
      name: "Éclaireur",
      description: "Coque légère polyvalente, vive et sobre.",
    },
    standard_hull: {
      name: "Coque standard",
      description: "Généraliste équilibrée, deux armes.",
    },
    warframe: {
      name: "Cadre de guerre",
      description: "Militaire : +15 % dégâts, trois armes.",
    },
    battlecruiser: {
      name: "Croiseur de bataille",
      description: "Colossal : +20 % dégâts, +10 % défense, quatre armes.",
    },
    light_freighter: {
      name: "Cargo léger",
      description: "Civil : +20 % soute, coque nue.",
    },
    heavy_freighter: {
      name: "Soutier lourd",
      description: "Civil : +50 % soute, quatre utilitaires.",
    },
    mining_barge: {
      name: "Barge minière",
      description: "Extraction : +60 % rendement de minage.",
    },
    colony_ark: {
      name: "Arche coloniale",
      description: "Colonisation : +30 % habitat, gros vaisseau.",
    },
    explorer_frame: {
      name: "Éclaireur lointain",
      description:
        "Prospection : +30 % senseurs, +15 % minage, deux propulseurs.",
    },
  },
  module: {
    laser_pulse: {
      name: "Laser à impulsion",
      description: "Arme de mêlée (court).",
    },
    autocannon: {
      name: "Canon automatique",
      description: "Arme à moyenne portée.",
    },
    railgun: {
      name: "Railgun",
      description: "Arme longue portée, perforante.",
    },
    missile_battery: {
      name: "Batterie de missiles",
      description: "Frappe très longue portée.",
    },
    armor_plating: { name: "Blindage", description: "+60 points de coque." },
    deflector_shield: {
      name: "Bouclier déflecteur",
      description: "+30 boucliers.",
    },
    aegis_shield: { name: "Bouclier Aegis", description: "+70 boucliers." },
    ion_thruster: {
      name: "Propulseur ionique",
      description: "+vitesse, un peu de carburant.",
    },
    warp_drive: {
      name: "Distorseur",
      description: "+vitesse forte, carburant élevé.",
    },
    ramscoop: {
      name: "Collecteur Bussard",
      description: "+vitesse légère, carburant réduit.",
    },
    cargo_pod: { name: "Module de soute", description: "+150 de capacité." },
    cargo_hold_xl: { name: "Cale XL", description: "+450 de capacité." },
    mining_laser: {
      name: "Laser de minage",
      description: "+40 rendement d'extraction.",
    },
    habitat_pod: {
      name: "Module d'habitat",
      description: "Rend le vaisseau colonisateur.",
    },
    fleet_uplink: {
      name: "Liaison de flotte",
      description: "+12 % dégâts de flotte (soutien).",
    },
    sensor_array: { name: "Réseau de senseurs", description: "+4 initiative." },
    plasma_cannon: {
      name: "Canon plasma",
      description: "Arme puissante à toute portée.",
    },
    reactive_plating: {
      name: "Blindage réactif",
      description: "+120 points de coque.",
    },
    graviton_engine: {
      name: "Propulseur à graviton",
      description: "+vitesse forte, sobre en carburant.",
    },
    deep_core_drill: {
      name: "Foreuse à noyau",
      description: "+80 rendement d'extraction.",
    },
  },
  directive: {
    barrage: {
      name: "Barrage",
      hint: "+35 % dégâts, défense affaiblie. Écrase l'évitement.",
    },
    shields: {
      name: "Boucliers renforcés",
      hint: "Défense max, dégâts réduits. Encaisse le barrage.",
    },
    evasive: {
      name: "Manœuvre d'évitement",
      hint: "Esquive. Déborde les boucliers.",
    },
    focus_fire: {
      name: "Tir concentré",
      hint: "Cible les gros vaisseaux d'abord. Neutre.",
    },
  },
  tech: {
    metallurgy: {
      name: "Métallurgie",
      description:
        "Les premiers hauts-fourneaux orbitaux. Débloque la fonderie.",
    },
    industrial_chains: {
      name: "Chaînes industrielles",
      description:
        "Standardisation des lignes d'assemblage. Débloque usines de composants et de biens.",
    },
    advanced_mining: {
      name: "Extraction avancée",
      description:
        "Foreuses à plasma auto-répliquantes. Production des mines +25 %.",
    },
    fusion_power: {
      name: "Fusion contrôlée",
      description:
        "Le deutérium des océans alimente les réacteurs. Centrales +30 %.",
    },
    automation: {
      name: "Automatisation",
      description: "Les machines ne dorment jamais. Toute production +10 %.",
    },
    orbital_logistics: {
      name: "Logistique orbitale",
      description:
        "Docks en orbite basse. Débloque le dock orbital, convois 30 % plus rapides.",
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
      description:
        "Coques modulaires à déploiement rapide. Vaisseaux coloniaux 30 % plus rapides.",
    },
    habitat_engineering: {
      name: "Habitats étendus",
      description: "Dômes pressurisés de nouvelle génération. Logements +25 %.",
    },
    light_terraforming: {
      name: "Terraformation légère",
      description:
        "Régulation atmosphérique locale. Habitabilité effective +10.",
    },
    orbital_construction: {
      name: "Construction orbitale",
      description:
        "Chantiers en apesanteur. +1 emplacement dans la file de construction.",
    },
    gateway_engineering: {
      name: "Ingénierie des portails",
      description:
        "Dompter les ancrages stables détectés en bord de galaxie. Débloque les chantiers de portail inter-galactique.",
    },
    civic_planning: {
      name: "Urbanisme",
      description:
        "Des villes pensées pour vivre, pas survivre. Satisfaction +5.",
    },
    education_networks: {
      name: "Réseaux éducatifs",
      description:
        "Le savoir circule plus vite que la lumière locale. Laboratoires +25 %.",
    },
    colonial_medicine: {
      name: "Médecine coloniale",
      description:
        "Cliniques adaptées aux biosphères hostiles. Croissance démographique +30 %.",
    },
    cultural_media: {
      name: "Médias culturels",
      description:
        "Le divertissement voyage en ansible. Besoin en biens −30 %.",
    },
    tax_reform: {
      name: "Réforme fiscale",
      description: "Une bureaucratie presque indolore. Crédits +30 %.",
    },
    governance_ai: {
      name: "IA de gouvernance",
      description:
        "Elle optimise tout, discrètement. Production et croissance +10 %.",
    },
    military_doctrine: {
      name: "Doctrine militaire",
      description:
        "Premiers arsenaux de guerre. Débloque chasseurs et frégates.",
    },
    fleet_logistics: {
      name: "Logistique de flotte",
      description:
        "Coordination des escadres. Débloque les vaisseaux de soutien.",
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
      description:
        "Des modules préfabriqués en orbite. Chantiers 25 % plus rapides, navals 20 %.",
    },
    heavy_industry: {
      name: "Industrie lourde",
      description:
        "Complexes métallurgiques intégrés. Fonderies +30 %, composants +25 %.",
    },
    nanofabrication: {
      name: "Nanofabrication",
      description:
        "L'assemblage atome par atome. Toute production +15 %, chantiers −15 %.",
    },
    deep_survey: {
      name: "Sondage profond",
      description:
        "Balises jetables en essaim. Sondes 30 % plus rapides et 30 % moins chères.",
    },
    arcology_design: {
      name: "Arcologies",
      description:
        "Des villes-mondes verticales et vivables. Logements +30 %, satisfaction +3.",
    },
    deep_terraforming: {
      name: "Terraformation profonde",
      description:
        "Remodeler une biosphère entière. Habitabilité +12, croissance +10 %.",
    },
    agro_synthesis: {
      name: "Agro-synthèse",
      description:
        "Protéines cultivées en cuve. Besoin en nourriture −30 %, fermes +20 %.",
    },
    civic_archives: {
      name: "Archives civiques",
      description: "Une mémoire commune qui fait nation. Influence +40 %.",
    },
    trade_charters: {
      name: "Chartes commerciales",
      description:
        "Des couloirs marchands protégés. Crédits +20 %, convois 15 % plus rapides, marge en comptoir +8 %.",
    },
    point_defense: {
      name: "Défense rapprochée",
      description: "Tourelles à tir rapide. Débloque la corvette d'escorte.",
    },
    strike_doctrine: {
      name: "Doctrine de frappe",
      description:
        "Frapper loin, avant d'être vu. Débloque le bombardier de ligne.",
    },
    dreadnoughts: {
      name: "Cuirassés",
      description:
        "Des forteresses mobiles qui décident d'une guerre. Débloque le cuirassé.",
    },
    plasma_weapons: {
      name: "Armement plasma",
      description:
        "Canons à plasma confiné. Débloque le canon plasma, puissant à toute portée.",
    },
    reactive_armor: {
      name: "Blindage réactif",
      description:
        "Plaques auto-réactives absorbant l'impact. Débloque le blindage réactif.",
    },
    graviton_thrusters: {
      name: "Propulsion à graviton",
      description:
        "Manipulation locale de la gravité. Débloque le propulseur à graviton.",
    },
    xeno_survey: {
      name: "Prospection xéno",
      description:
        "Cartographie des confins inexplorés. Débloque l'éclaireur lointain et la foreuse à noyau.",
    },
    orbital_engineering: {
      name: "Ingénierie orbitale",
      description:
        "Débloque la fondation d'une station orbitale et sa zone industrielle de base.",
    },
    orbital_astrophysics: {
      name: "Astrophysique orbitale",
      description: "Débloque la zone scientifique d'une station orbitale.",
    },
    orbital_armaments: {
      name: "Armement orbital",
      description: "Débloque la zone militaire d'une station orbitale.",
    },
    orbital_commerce: {
      name: "Commerce orbital",
      description:
        "Débloque la zone commerciale d'une station orbitale et son marché de ressources.",
    },
    orbital_brokerage: {
      name: "Courtage orbital",
      description:
        "Débloque le marché de plans et de vaisseaux en station orbitale.",
    },
  },
  zoneType: {
    industrial_zone: {
      name: "Zone industrielle",
      description:
        "Accueille les installations de production et de transformation.",
    },
    science_zone: {
      name: "Zone scientifique",
      description: "Accueille les installations de recherche.",
    },
    military_zone: {
      name: "Zone militaire",
      description: "Accueille les installations de défense et d'armement.",
    },
    commercial_zone: {
      name: "Zone commerciale",
      description: "Accueille les installations de marché.",
    },
  },
  installation: {
    orbital_solar_array: {
      name: "Panneaux solaires orbitaux",
      description: "Produit de l'énergie sans intrant.",
    },
    orbital_smelter_module: {
      name: "Module de fonderie orbitale",
      description: "Transforme le minerai livré en métaux.",
    },
    orbital_observatory: {
      name: "Observatoire orbital",
      description: "Produit de la science.",
    },
    orbital_research_lab: {
      name: "Laboratoire de recherche orbital",
      description: "Production de science accrue.",
    },
    orbital_armory: {
      name: "Arsenal orbital",
      description: "Contrats de défense : génère des crédits.",
    },
    orbital_shipyard_annex: {
      name: "Annexe de chantier naval orbitale",
      description: "Produit des composants.",
    },
    orbital_trade_exchange: {
      name: "Comptoir d'échange orbital",
      description:
        "Ouvre le marché de ressources de la station (accès et taxe pilotés par le propriétaire).",
    },
    orbital_brokerage_house: {
      name: "Maison de courtage orbitale",
      description: "Ouvre le marché de plans et de vaisseaux de la station.",
    },
  },
};

export const contentEn: typeof contentFr = {
  resource: {
    energy: "Energy",
    ore: "Ore",
    metals: "Metals",
    components: "Components",
    food: "Food",
    goods: "Goods",
    credits: "Credits",
    science: "Science",
  },
  planetType: {
    telluric: "Telluric",
    oceanic: "Oceanic",
    volcanic: "Volcanic",
    frozen: "Frozen",
    arid: "Arid",
    gas: "Gas giant",
  },
  factionMood: {
    neutral: "Calm",
    boom: "Boom — bonus purchases",
    shortage: "Shortage — contract in progress",
    embargo: "Embargo — trade closed to strangers",
  },
  relationBadge: {
    neutral: "",
    nap: " 🤝 non-aggression pact",
    alliance: " ⭐ allied",
    war: " ⚔ at war",
  },
  objectiveKind: {
    colonize_n_systems: "Colonize new systems",
    hold_system: "Defend a claimed system",
    lead_population: "Lead the population ranking",
    lead_influence: "Lead the influence ranking",
  },
  worldEvent: {
    economic_crisis: { name: "Economic crisis" },
    gold_rush: { name: "Gold rush" },
    pirate_surge: { name: "Pirate surge" },
    faction_boom: { name: "Faction boom" },
  },
  repTier: {
    ally: "Ally",
    partner: "Partner",
    associate: "Associate",
    neutral: "Neutral",
  },
  branch: {
    industry: "Industry",
    colonization: "Colonization",
    society: "Society",
    military: "Military",
  },
  slot: {
    weapon: "Weapon",
    defense: "Defense",
    propulsion: "Propulsion",
    utility: "Utility",
  },
  role: {
    weapon: "Weapon",
    defense: "Defense",
    propulsion: "Propulsion",
    cargo: "Cargo",
    mining: "Mining",
    habitat: "Habitat",
    support: "Support",
    sensor: "Sensor",
  },
  stationMarketAccess: {
    closed: { name: "Closed", description: "Only the owner can trade here." },
    alliance: {
      name: "Allies",
      description: "Open to allied empires.",
    },
    nap: {
      name: "Pact or better",
      description: "Open to allies and non-aggression pact partners.",
    },
    public: {
      name: "Public",
      description: "Open to any empire, except while at war.",
    },
  },
  building: {
    mine: { name: "Mine", description: "Extracts ore (based on deposit)." },
    power_plant: {
      name: "Power plant",
      description: "Produces energy (based on deposit).",
    },
    farm: {
      name: "Farm",
      description: "Produces food (based on deposit).",
    },
    habitat: {
      name: "Habitat",
      description: "20 housing per level (scaled by habitability).",
    },
    storage_depot: {
      name: "Storage depot",
      description: "+1000 storage per level.",
    },
    laboratory: {
      name: "Laboratory",
      description: "Produces science, consumes energy.",
    },
    smelter: { name: "Smelter", description: "Ore + energy → metals." },
    component_factory: {
      name: "Component factory",
      description: "Metals + energy → components.",
    },
    goods_factory: {
      name: "Goods factory",
      description: "Metals + energy → consumer goods.",
    },
    shipyard: {
      name: "Shipyard",
      description: "Builds civilian ships (freighters).",
    },
    monument: {
      name: "Monument",
      description: "Cultural influence: +0.5 influence per tick.",
    },
    orbital_dock: {
      name: "Orbital dock",
      description:
        "Orbital warehouse and elevator to the ground. Essential: ships only load what's already in orbit.",
    },
  },
  ship: {
    cargo_small: {
      name: "Light freighter",
      description: "200 cargo hold. The workhorse of space.",
    },
    cargo_large: {
      name: "Heavy freighter",
      description: "600 cargo hold. Requires orbital logistics.",
    },
    hauler: {
      name: "Hauler",
      description:
        "1800 cargo hold, slow and fuel-hungry. Requires the space elevator.",
    },
    courier: {
      name: "Courier",
      description: "80 cargo hold, nearly twice as fast and fuel-efficient.",
    },
  },
  faction: {
    ferride: {
      name: "Ferride Consortium",
      description:
        "Orbital forges and assembly lines. Sells metal, pays well for provisions.",
    },
    ostara_league: {
      name: "Ostara Agrarian League",
      description:
        "The granary of the galaxy. Sells food and goods, buys industrial output.",
    },
    aether_cartel: {
      name: "Aether Cartel",
      description:
        "Reactors, raw ore and discretion. Sells energy, buys refined goods.",
    },
  },
  warship: {
    fighter: {
      name: "Fighter",
      description: "Fast, lethal in close combat. Counters cruisers.",
    },
    frigate: {
      name: "Frigate",
      description: "Versatile at mid range. Counters fighters.",
    },
    cruiser: {
      name: "Cruiser",
      description: "Heavy, long range. Counters frigates.",
    },
    support: {
      name: "Support ship",
      description: "Thick shields, +12% fleet damage.",
    },
    corvette: {
      name: "Escort corvette",
      description: "Fast and cheap. Harasses cruisers and dreadnoughts.",
    },
    bomber: {
      name: "Line bomber",
      description: "Strikes from very far, fragile up close. Guts frigates.",
    },
    dreadnought: {
      name: "Dreadnought",
      description: "Colossal hull, overwhelming firepower. Fears light swarms.",
    },
  },
  chassis: {
    scout_frame: {
      name: "Scout",
      description: "Light versatile hull, fast and fuel-efficient.",
    },
    standard_hull: {
      name: "Standard hull",
      description: "Balanced generalist, two weapon slots.",
    },
    warframe: {
      name: "War frame",
      description: "Military: +15% damage, three weapon slots.",
    },
    battlecruiser: {
      name: "Battlecruiser",
      description: "Colossal: +20% damage, +10% defense, four weapon slots.",
    },
    light_freighter: {
      name: "Light freighter",
      description: "Civilian: +20% cargo hold, bare hull.",
    },
    heavy_freighter: {
      name: "Heavy freighter",
      description: "Civilian: +50% cargo hold, four utility slots.",
    },
    mining_barge: {
      name: "Mining barge",
      description: "Extraction: +60% mining yield.",
    },
    colony_ark: {
      name: "Colony ark",
      description: "Colonization: +30% habitat, large ship.",
    },
    explorer_frame: {
      name: "Deep scout",
      description:
        "Prospecting: +30% sensors, +15% mining, two propulsion slots.",
    },
  },
  module: {
    laser_pulse: {
      name: "Pulse laser",
      description: "Close-range weapon (short).",
    },
    autocannon: {
      name: "Autocannon",
      description: "Mid-range weapon.",
    },
    railgun: {
      name: "Railgun",
      description: "Long-range, armor-piercing weapon.",
    },
    missile_battery: {
      name: "Missile battery",
      description: "Very long-range strike.",
    },
    armor_plating: { name: "Armor plating", description: "+60 hull points." },
    deflector_shield: {
      name: "Deflector shield",
      description: "+30 shields.",
    },
    aegis_shield: { name: "Aegis shield", description: "+70 shields." },
    ion_thruster: {
      name: "Ion thruster",
      description: "+speed, uses a bit of fuel.",
    },
    warp_drive: {
      name: "Warp drive",
      description: "+high speed, high fuel use.",
    },
    ramscoop: {
      name: "Bussard ramscoop",
      description: "+light speed boost, reduced fuel use.",
    },
    cargo_pod: { name: "Cargo pod", description: "+150 capacity." },
    cargo_hold_xl: { name: "XL cargo hold", description: "+450 capacity." },
    mining_laser: {
      name: "Mining laser",
      description: "+40 mining yield.",
    },
    habitat_pod: {
      name: "Habitat pod",
      description: "Makes the ship a colonizer.",
    },
    fleet_uplink: {
      name: "Fleet uplink",
      description: "+12% fleet damage (support).",
    },
    sensor_array: { name: "Sensor array", description: "+4 initiative." },
    plasma_cannon: {
      name: "Plasma cannon",
      description: "Powerful weapon at any range.",
    },
    reactive_plating: {
      name: "Reactive plating",
      description: "+120 hull points.",
    },
    graviton_engine: {
      name: "Graviton engine",
      description: "+high speed, fuel-efficient.",
    },
    deep_core_drill: {
      name: "Deep core drill",
      description: "+80 mining yield.",
    },
  },
  directive: {
    barrage: {
      name: "Barrage",
      hint: "+35% damage, weakened defense. Crushes evasion.",
    },
    shields: {
      name: "Reinforced shields",
      hint: "Max defense, reduced damage. Absorbs barrage.",
    },
    evasive: {
      name: "Evasive maneuver",
      hint: "Dodges. Bypasses shields.",
    },
    focus_fire: {
      name: "Focus fire",
      hint: "Targets big ships first. Neutral.",
    },
  },
  tech: {
    metallurgy: {
      name: "Metallurgy",
      description: "The first orbital blast furnaces. Unlocks the smelter.",
    },
    industrial_chains: {
      name: "Industrial chains",
      description:
        "Standardized assembly lines. Unlocks component and goods factories.",
    },
    advanced_mining: {
      name: "Advanced mining",
      description: "Self-replicating plasma drills. Mine output +25%.",
    },
    fusion_power: {
      name: "Controlled fusion",
      description: "Ocean deuterium fuels the reactors. Power plants +30%.",
    },
    automation: {
      name: "Automation",
      description: "Machines never sleep. All production +10%.",
    },
    orbital_logistics: {
      name: "Orbital logistics",
      description:
        "Low-orbit docks. Unlocks the orbital dock, convoys 30% faster.",
    },
    space_elevator: {
      name: "Space elevator",
      description:
        "A ribbon up to orbit. Throughput +80%, capacity +40%, convoy fuel −20%. Unlocks the hauler.",
    },
    astro_cartography: {
      name: "Stellar cartography",
      description: "Long-range interferometers. Probes 40% faster.",
    },
    autonomous_probes: {
      name: "Autonomous probes",
      description: "Cheap self-assembling swarms. Probe cost −60%.",
    },
    colonial_engineering: {
      name: "Colonial engineering",
      description: "Rapid-deploy modular hulls. Colony ships 30% faster.",
    },
    habitat_engineering: {
      name: "Extended habitats",
      description: "Next-gen pressurized domes. Housing +25%.",
    },
    light_terraforming: {
      name: "Light terraforming",
      description: "Local atmospheric regulation. Effective habitability +10.",
    },
    orbital_construction: {
      name: "Orbital construction",
      description: "Zero-gravity yards. +1 building queue slot.",
    },
    gateway_engineering: {
      name: "Gateway engineering",
      description:
        "Taming the stable anchors found at the galaxy's edge. Unlocks intergalactic gateway construction.",
    },
    civic_planning: {
      name: "Urban planning",
      description:
        "Cities designed for living, not just surviving. Satisfaction +5.",
    },
    education_networks: {
      name: "Education networks",
      description:
        "Knowledge travels faster than local light. Laboratories +25%.",
    },
    colonial_medicine: {
      name: "Colonial medicine",
      description:
        "Clinics adapted to hostile biospheres. Population growth +30%.",
    },
    cultural_media: {
      name: "Cultural media",
      description: "Entertainment travels by ansible. Goods demand −30%.",
    },
    tax_reform: {
      name: "Tax reform",
      description: "An almost painless bureaucracy. Credits +30%.",
    },
    governance_ai: {
      name: "Governance AI",
      description:
        "It optimizes everything, quietly. Production and growth +10%.",
    },
    military_doctrine: {
      name: "Military doctrine",
      description: "First war arsenals. Unlocks fighters and frigates.",
    },
    fleet_logistics: {
      name: "Fleet logistics",
      description: "Squadron coordination. Unlocks support ships.",
    },
    capital_ships: {
      name: "Capital ships",
      description: "Yards now assemble heavy cruisers.",
    },
    ore_processing: {
      name: "Ore processing",
      description:
        "On-site crushing and sorting. Mines +15%, outposts +40%, storage +25%.",
    },
    modular_construction: {
      name: "Modular construction",
      description:
        "Prefabricated orbital modules. Yards 25% faster, shipyards 20%.",
    },
    heavy_industry: {
      name: "Heavy industry",
      description:
        "Integrated metallurgical complexes. Smelters +30%, components +25%.",
    },
    nanofabrication: {
      name: "Nanofabrication",
      description: "Atom-by-atom assembly. All production +15%, yards −15%.",
    },
    deep_survey: {
      name: "Deep survey",
      description:
        "Disposable swarm beacons. Probes 30% faster and 30% cheaper.",
    },
    arcology_design: {
      name: "Arcology design",
      description:
        "Vertical, livable world-cities. Housing +30%, satisfaction +3.",
    },
    deep_terraforming: {
      name: "Deep terraforming",
      description:
        "Reshaping an entire biosphere. Habitability +12, growth +10%.",
    },
    agro_synthesis: {
      name: "Agro-synthesis",
      description: "Vat-grown proteins. Food demand −30%, farms +20%.",
    },
    civic_archives: {
      name: "Civic archives",
      description: "A shared memory that makes a nation. Influence +40%.",
    },
    trade_charters: {
      name: "Trade charters",
      description:
        "Protected trade lanes. Credits +20%, convoys 15% faster, trading-post margin +8%.",
    },
    point_defense: {
      name: "Point defense",
      description: "Rapid-fire turrets. Unlocks the escort corvette.",
    },
    strike_doctrine: {
      name: "Strike doctrine",
      description:
        "Strike from afar, before being seen. Unlocks the line bomber.",
    },
    dreadnoughts: {
      name: "Dreadnoughts",
      description:
        "Mobile fortresses that decide wars. Unlocks the dreadnought.",
    },
    plasma_weapons: {
      name: "Plasma weaponry",
      description:
        "Confined plasma cannons. Unlocks the plasma cannon, powerful at any range.",
    },
    reactive_armor: {
      name: "Reactive armor",
      description:
        "Self-reactive plates absorbing impact. Unlocks reactive plating.",
    },
    graviton_thrusters: {
      name: "Graviton propulsion",
      description: "Local gravity manipulation. Unlocks the graviton engine.",
    },
    xeno_survey: {
      name: "Xeno survey",
      description:
        "Mapping unexplored frontiers. Unlocks the deep scout and the deep core drill.",
    },
    orbital_engineering: {
      name: "Orbital engineering",
      description:
        "Unlocks the founding of an orbital station and its base industrial zone.",
    },
    orbital_astrophysics: {
      name: "Orbital astrophysics",
      description: "Unlocks an orbital station's science zone.",
    },
    orbital_armaments: {
      name: "Orbital armaments",
      description: "Unlocks an orbital station's military zone.",
    },
    orbital_commerce: {
      name: "Orbital commerce",
      description:
        "Unlocks an orbital station's commercial zone and its resource market.",
    },
    orbital_brokerage: {
      name: "Orbital brokerage",
      description:
        "Unlocks the blueprint and ship market at an orbital station.",
    },
  },
  zoneType: {
    industrial_zone: {
      name: "Industrial zone",
      description: "Hosts production and processing installations.",
    },
    science_zone: {
      name: "Science zone",
      description: "Hosts research installations.",
    },
    military_zone: {
      name: "Military zone",
      description: "Hosts defense and armament installations.",
    },
    commercial_zone: {
      name: "Commercial zone",
      description: "Hosts market installations.",
    },
  },
  installation: {
    orbital_solar_array: {
      name: "Orbital solar array",
      description: "Produces energy with no input.",
    },
    orbital_smelter_module: {
      name: "Orbital smelter module",
      description: "Converts delivered ore into metals.",
    },
    orbital_observatory: {
      name: "Orbital observatory",
      description: "Produces science.",
    },
    orbital_research_lab: {
      name: "Orbital research lab",
      description: "Increased science output.",
    },
    orbital_armory: {
      name: "Orbital armory",
      description: "Defense contracts: generates credits.",
    },
    orbital_shipyard_annex: {
      name: "Orbital shipyard annex",
      description: "Produces components.",
    },
    orbital_trade_exchange: {
      name: "Orbital trade exchange",
      description:
        "Opens the station's resource market (access and tax set by the owner).",
    },
    orbital_brokerage_house: {
      name: "Orbital brokerage house",
      description: "Opens the station's blueprint and ship market.",
    },
  },
};
