import type { CentralBody, OrbitZone } from "../../model/universe.js";
import type { ResourceId } from "../../model/resources.js";
import { blackHoleType } from "../../content/astro/black-hole-types.js";
import { starClass } from "../../content/astro/star-classes.js";
import { whiteHoleType } from "../../content/astro/white-hole-types.js";

/**
 * La chaîne physique (chantier 45.2).
 *
 * ## Pourquoi elle existe
 *
 * Sans elle, « des types structurants » reste un mot : les types porteraient des
 * multiplicateurs posés à la main au lieu de conséquences. Avec elle, une naine rouge ne
 * nourrit pas la même colonie qu'une géante bleue non pas parce qu'un coefficient le dit,
 * mais parce que sa zone habitable est trente fois plus proche et que ses éruptions décapent
 * l'atmosphère d'un monde dont la vitesse de libération est trop basse.
 *
 * ## Ce qu'elle remplace
 *
 * `bodyPhysicals` portait trois béquilles, documentées comme telles : la température venait
 * d'une table par type de planète et la distance à l'étoile ne l'écartait que de ±45 °C « à
 * dessein » ; `temperatePull` retirait ensuite la fiche vers 15 °C quand l'habitabilité était
 * haute, « pour que la fiche corrobore la donnée de jeu » ; l'atmosphère était pondérée par
 * l'habitabilité. Les trois existaient pour la même raison — l'habitabilité était tirée
 * INDÉPENDAMMENT de la physique, et il fallait ensuite les réconcilier.
 *
 * Ici l'habitabilité **tombe** de la physique. Les béquilles n'ont plus rien à réconcilier.
 *
 * ## Le sens de lecture
 *
 * Une seule direction, aucune boucle — c'est ce qui rend la chaîne calculable :
 *
 * ```
 * classe + masse  →  luminosité
 *         ↓ Σ L / d²
 *     irradiance  →  zone habitable, ligne des glaces
 *         ↓ × (1 − albédo)
 *     température d'équilibre
 *         ↓  croisée avec  rayon × densité → gravité → VITESSE DE LIBÉRATION
 *     rétention atmosphérique
 *         ↓
 *     atmosphère + pression  →  effet de serre  →  TEMPÉRATURE DE SURFACE
 *         ↓  croisée avec gravité, rayonnement
 *     HABITABILITÉ
 * ```
 *
 * L'effet de serre dépend de l'atmosphère, et l'atmosphère de la température : la boucle est
 * coupée en faisant dépendre la rétention de la température d'**équilibre** (sans
 * atmosphère), et la température de **surface** de l'effet de serre qui en résulte. C'est
 * aussi l'ordre réel des choses.
 *
 * Tout est dérivé : la chaîne ne coûte pas une colonne.
 */

// ── Constantes physiques ─────────────────────────────────────────────────────

/**
 * Bornes de la zone habitable, en unités astronomiques par racine de luminosité.
 *
 * Estimation conservatrice de Kopparapu : bord interne à la limite de l'emballement de
 * serre, bord externe à celle de la condensation du gaz carbonique. La dépendance en `√L`
 * vient de ce que l'irradiance décroît en `1/d²` — recevoir autant de flux quatre fois plus
 * loin demande seize fois plus de luminosité.
 */
const HZ_INNER_AU = 0.95;
const HZ_OUTER_AU = 1.67;

/**
 * Ligne des glaces : au-delà, l'eau reste solide dans le vide et les corps se forment
 * riches en volatiles. C'est elle qui sépare les mondes rocheux des géantes.
 */
const ICE_LINE_AU = 2.7;

/**
 * Température d'équilibre d'un corps d'albédo nul à une unité astronomique du Soleil, en
 * kelvins. La Terre, d'albédo 0,3, y est à 255 K — et à 288 K une fois la serre comptée.
 */
const EQUILIBRIUM_TEMP_AT_1AU = 278.5;

/** Vitesse de libération terrestre, en km/s. */
const EARTH_ESCAPE_KMS = 11.19;

/**
 * Paramètre d'échappement de Jeans à l'échelle terrestre, servant de normalisation.
 *
 * L'échappement thermique d'une atmosphère se joue sur le rapport de l'énergie de liaison à
 * l'agitation thermique, soit `v_lib² / T`. Rapporté à la Terre, il se lit directement : à 1
 * un corps retient ce que la Terre retient, en dessous il fuit, au-dessus il accumule.
 */
const EARTH_RETENTION = (EARTH_ESCAPE_KMS * EARTH_ESCAPE_KMS) / 255;

/** Zéro absolu, pour passer des kelvins aux degrés. */
const KELVIN_OFFSET = 273.15;

// ── Étage stellaire ──────────────────────────────────────────────────────────

/**
 * Luminosité d'un corps central, en luminosités solaires.
 *
 * La masse module la valeur de la classe selon `L ∝ M^exposant` — 3,5 sur la séquence
 * principale, où c'est la loi réelle ; amorti pour les stades évolués, dont la luminosité
 * est fixée par le cœur ; négatif pour une naine blanche, qui rétrécit en grossissant.
 *
 * Une singularité n'éclaire pas : elle rend zéro. Son disque d'accrétion rayonne, mais ce
 * rayonnement stérilise au lieu de réchauffer — il entre par `radiationOf`, pas ici.
 */
export function luminosityOf(body: CentralBody): number {
  if (body.kind !== "star") return 0;
  const def = starClass(body.typeId);
  const [min, max] = def.massRange;
  const mid = (min + max) / 2;
  if (mid <= 0 || body.mass <= 0) return def.luminosity;
  return def.luminosity * (body.mass / mid) ** def.massLuminosityExponent;
}

/** Luminosité totale d'un système : les corps centraux éclairent ensemble. */
export function systemLuminosity(bodies: readonly CentralBody[]): number {
  return bodies.reduce((sum, body) => sum + luminosityOf(body), 0);
}

/**
 * Zone habitable du système, en unités astronomiques.
 *
 * Un système sans étoile — une paire d'errants, un trou noir seul — n'en a pas : la borne
 * interne y vaut zéro, ce qui rend l'intervalle vide et la teste comme telle.
 */
export function habitableZone(
  bodies: readonly CentralBody[],
): readonly [number, number] {
  const l = systemLuminosity(bodies);
  if (l <= 0) return [0, 0];
  const root = Math.sqrt(l);
  return [HZ_INNER_AU * root, HZ_OUTER_AU * root];
}

/** Distance au-delà de laquelle l'eau reste solide, en unités astronomiques. */
export function iceLine(bodies: readonly CentralBody[]): number {
  return ICE_LINE_AU * Math.sqrt(systemLuminosity(bodies));
}

/**
 * Rayonnement ionisant reçu à une distance donnée, 0–5 comme les catalogues l'expriment.
 *
 * Il décroît en `1/d²` comme la lumière, mais vient d'ailleurs : l'activité éruptive d'une
 * étoile, le disque d'accrétion d'un trou noir, le faisceau d'un pulsar. C'est lui qui
 * décape une atmosphère que la seule température aurait laissée en place.
 */
export function radiationAt(
  bodies: readonly CentralBody[],
  distanceAu: number,
): number {
  const d = Math.max(0.01, distanceAu);
  const total = bodies.reduce((sum, body) => {
    const output =
      body.kind === "star"
        ? starClass(body.typeId).radiation
        : body.kind === "blackHole"
          ? blackHoleType(body.typeId).radiation
          : whiteHoleType(body.typeId).radiation;
    // Deux régimes, parce que deux physiques.
    //
    // Le rayonnement d'une étoile ordinaire suit son FLUX, et non la seule distance. En
    // `output / d²`, une naine rouge devenait létale dans sa propre zone habitable : celle-ci
    // est à 0,13 UA, donc `1/d²` y vaut cinquante-neuf. Or une zone habitable est par
    // définition l'endroit où le flux est comparable d'une étoile à l'autre. Mesuré : toute
    // naine rouge écrasait ses mondes à 15 d'habitabilité, et elles sont 40 % du ciel.
    //
    // Un résidu — pulsar, naine blanche — et une singularité échappent à cette règle : leur
    // rayonnement ne vient pas de leur fusion mais de leur rotation, de leur champ ou de leur
    // disque. Il garde donc la loi en `1/d²`, sans quoi un pulsar deviendrait inoffensif
    // faute de luminosité optique.
    const nonThermal =
      body.kind !== "star" || starClass(body.typeId).nonThermalRadiation;
    const flux = nonThermal ? 1 / (d * d) : luminosityOf(body) / (d * d);
    return sum + output * Math.min(4, flux);
  }, 0);
  return Math.min(5, total);
}

/**
 * Érosion de l'atmosphère par l'activité éruptive des étoiles du système, entre 0 et 1.
 *
 * C'est le rôle propre de `flareActivity`, et il n'est pas le même que celui du rayonnement :
 * une éruption n'irradie pas durablement un sol, elle **arrache l'atmosphère** d'un monde
 * dont la gravité ne suffit pas à la retenir. Les additionner sur la même échelle comptait la
 * naine rouge deux fois.
 *
 * C'est aussi ce qui donne son sens au couple naine rouge / vitesse de libération : un monde
 * assez massif garde son voile malgré les éruptions, un monde léger le perd. Deux planètes de
 * même type au même endroit n'ont donc pas le même destin.
 */
export function flareErosion(bodies: readonly CentralBody[]): number {
  const worst = bodies.reduce(
    (max, body) =>
      body.kind === "star"
        ? Math.max(max, starClass(body.typeId).flareActivity)
        : max,
    0,
  );
  return Math.max(0.4, 1 - worst * 0.2);
}

// ── Le pont entre la scène et la physique ────────────────────────────────────

/**
 * Rayon d'orbite, en unités de scène, où tombe le BORD INTERNE de la zone habitable — quelle
 * que soit l'étoile.
 *
 * ## Pourquoi le bord interne, et non le milieu
 *
 * Calé sur le milieu, un monde tempéré sortait à −13 °C et l'univers entier devenait
 * inhabitable : 89 % des corps à zéro, 6,6 % des systèmes avec un monde viable, mesuré. La
 * raison est dans la définition même de la zone habitable conservatrice — elle marque où
 * l'eau PEUT être liquide *avec assez d'effet de serre*, et sa moitié externe demande une
 * atmosphère de gaz carbonique épaisse que la plupart des mondes n'ont pas. La Terre, elle,
 * est à 3 % du bord interne.
 *
 * Ancrer sur le bord interne place la deuxième orbite du générateur là où se trouve la Terre,
 * et laisse les suivantes se refroidir comme Mars se refroidit.
 *
 * ## Pourquoi une conversion plutôt qu'une échelle d'orbites variable
 *
 * La zone habitable réelle vaut `0,95√L` à `1,67√L` UA : 0,12–0,20 UA pour une naine rouge,
 * 67–118 UA pour une géante bleue, un facteur cinq cents entre les deux. Le générateur pose
 * les orbites entre 70 et 290 unités, en absolu. Poser les orbites en unités astronomiques
 * aurait donc fait varier l'étendue d'un système d'un facteur cinq cents — et avec elle le
 * coût de trajet intra-système, le cadrage de la caméra, les plans de coupe, l'emprise des
 * étiquettes, tout ce que le chantier 37 a calibré.
 *
 * Ce n'est pas l'échelle des orbites qui dépend de l'étoile, c'est le **facteur de
 * conversion**. Un corps à 130 unités est au milieu de la zone habitable de son système,
 * qu'elle soit à 0,16 UA ou à 92 UA. La scène reste normalisée, la physique reste vraie, et
 * rien de ce qui était calibré ne bouge.
 *
 * C'est exactement ce que `galaxyContentScale` fait déjà d'un palier de carte à l'autre : le
 * patron existait, il se réapplique ici.
 *
 * ## Ce que la valeur 130 décide
 *
 * Avec les orbites du générateur (70, 125, 180, 235, 290), elle place le premier créneau en
 * deçà du bord interne (brûlant), le deuxième là où est la Terre, le troisième dans la
 * moitié froide de la zone, et les deux derniers au-delà. Un système typique a donc un monde
 * tempéré et quelques mondes exploitables — ce que le verrou de calibration surveille.
 */
export const HABITABLE_SCENE_RADIUS = 110;

/**
 * Échelle d'un système sans étoile — errants, systèmes à singularité seule.
 *
 * Ils n'ont pas de zone habitable, donc pas de calage possible. La valeur retenue est celle
 * d'un système solaire, pour que les distances affichées restent du même ordre plutôt que de
 * verser dans l'arbitraire visible.
 */
const DARK_SYSTEM_AU_PER_UNIT = 1 / HABITABLE_SCENE_RADIUS;

/** Unités astronomiques par unité de scène, pour ce système. */
export function auPerSceneUnit(bodies: readonly CentralBody[]): number {
  const [inner] = habitableZone(bodies);
  if (inner <= 0) return DARK_SYSTEM_AU_PER_UNIT;
  return inner / HABITABLE_SCENE_RADIUS;
}

/** Distance physique d'un corps à son étoile, en unités astronomiques. */
export function auAt(
  bodies: readonly CentralBody[],
  orbitRadius: number,
): number {
  return orbitRadius * auPerSceneUnit(bodies);
}

/**
 * Zone thermique d'une orbite — ce qui conditionne le type de corps que le générateur a le
 * droit d'y poser, et le sens même de l'inversion de causalité : l'étoile décide d'abord,
 * les corps suivent.
 *
 * Un système sans étoile est entièrement « frozen » : rien n'y chauffe.
 */
export function zoneAt(
  bodies: readonly CentralBody[],
  orbitRadius: number,
): OrbitZone {
  const [inner, outer] = habitableZone(bodies);
  if (inner <= 0) return "frozen";
  const au = auAt(bodies, orbitRadius);
  if (au < inner) return "inner";
  if (au <= outer) return "habitable";
  return au < iceLine(bodies) ? "outer" : "frozen";
}

// ── Étage orbital ────────────────────────────────────────────────────────────

/**
 * Irradiance reçue, en constantes solaires (la Terre en reçoit 1).
 *
 * C'est **le** lien entre une étoile et un corps, et l'entrée de la mécanique énergie.
 */
export function irradianceAt(
  bodies: readonly CentralBody[],
  distanceAu: number,
): number {
  const d = Math.max(0.01, distanceAu);
  return systemLuminosity(bodies) / (d * d);
}

// ── Étage structurel ─────────────────────────────────────────────────────────

/** Gravité de surface en `g` : à densité égale, un corps deux fois plus gros pèse deux fois plus. */
export function surfaceGravity(radiusEarth: number, density: number): number {
  return density * radiusEarth;
}

/**
 * Vitesse de libération, en km/s — la grandeur charnière qui manquait.
 *
 * `v = √(2GM/R)`, et `M ∝ ρR³`, donc `v ∝ R√ρ`. C'est elle qui relie la structure d'un corps
 * à sa capacité de garder une atmosphère : une planète naine et une super-Terre peuvent
 * avoir la même densité et la même variante, l'une est nue et l'autre étouffe.
 */
export function escapeVelocity(radiusEarth: number, density: number): number {
  return EARTH_ESCAPE_KMS * radiusEarth * Math.sqrt(density);
}

// ── Étage thermique ──────────────────────────────────────────────────────────

/**
 * Température d'équilibre radiatif, en kelvins — avant toute atmosphère.
 *
 * `T = 278,5 × (S(1−a))^¼`. L'albédo compte autant que la distance : une gelée d'albédo 0,62
 * est plus froide que son irradiance ne l'imposerait, et la rétroaction s'emballe.
 */
export function equilibriumTempK(irradiance: number, albedo: number): number {
  const absorbed = Math.max(0, irradiance * (1 - albedo));
  return EQUILIBRIUM_TEMP_AT_1AU * absorbed ** 0.25;
}

/**
 * Rétention atmosphérique, normalisée sur la Terre (1 = retient autant qu'elle).
 *
 * Sous 0,15 un corps est nu quoi qu'il dégaze ; au-delà de 2,5 il accumule tout, y compris
 * l'hydrogène — c'est ce qui fait une géante gazeuse plutôt qu'un gros monde rocheux.
 */
export function atmosphereRetention(
  escapeKms: number,
  equilibriumK: number,
): number {
  if (equilibriumK <= 0) return 0;
  return (escapeKms * escapeKms) / equilibriumK / EARTH_RETENTION;
}

/**
 * Réchauffement de serre, en kelvins.
 *
 * Croît avec la pression, mais moins vite qu'elle : la bande d'absorption sature. En
 * racine, la Terre à 1 bar gagne ses 33 K, Mars à 0,006 bar quelques kelvins, et Vénus à
 * 92 bars les ~500 K qui la rendent plus chaude que Mercure.
 */
export function greenhouseK(
  pressureBar: number,
  greenhousePerBar: number,
): number {
  if (pressureBar <= 0) return 0;
  return greenhousePerBar * Math.sqrt(pressureBar);
}

/** Température de surface, en degrés — la seule que le joueur lit. */
export function surfaceTempC(equilibriumK: number, greenhouse: number): number {
  return equilibriumK + greenhouse - KELVIN_OFFSET;
}

// ── Ce que le ciel rapporte ──────────────────────────────────────────────────

/**
 * Multiplicateurs de rendement apportés par le ciel d'un système, par ressource.
 *
 * `Partial<Record<ResourceId, number>>` comme partout dans le dépôt : une clé absente vaut 1.
 * C'est ce que `colony.ts` compose avec le gisement du corps, et le seul endroit où l'étoile
 * et la galaxie entrent dans l'économie d'une colonie.
 */
export type AstroYield = Partial<Record<ResourceId, number>>;

/** Ciel neutre : ce que reçoit un appelant qui n'en connaît pas, et le défaut partout. */
export const NEUTRAL_ASTRO: AstroYield = {};

/**
 * Bornes de ce que l'irradiance fait au rendement énergétique.
 *
 * Une colonie proche de son étoile capte plus, une colonie lointaine moins — mais ni jusqu'à
 * l'absurde : sans bornes, un monde à 0,1 UA d'une supergéante multiplierait sa production par
 * mille, et un monde de la ceinture externe la diviserait par cent. Le rapport de cinq entre
 * les deux extrêmes suffit à ce que le joueur le sente.
 */
const IRRADIANCE_YIELD_MIN = 0.45;
const IRRADIANCE_YIELD_MAX = 2.2;

/**
 * Rendement apporté par le ciel à un corps donné (chantier 45.2).
 *
 * Trois contributions se composent, et chacune répond à une question différente :
 *
 * - **La galaxie** dit ce que la matière contient. Sa métallicité est la cause physique du
 *   biais — une elliptique vieille a perdu son gaz et rend de la roche, une irrégulière jeune
 *   nourrit sans fournir de fer.
 * - **Les étoiles** disent ce que leur voisinage a enrichi. Une relique a soufflé ses métaux
 *   lourds alentour ; un disque d'accrétion est un réacteur.
 * - **L'irradiance** dit ce que le corps reçoit, ici et maintenant. C'est elle qui fait qu'une
 *   colonie de naine rouge doit produire son énergie autrement.
 *
 * Rien n'est persisté : tout se relit du type de galaxie, des corps centraux et de l'orbite.
 * Un rééquilibrage de catalogue change donc les rendements sans toucher à l'univers — c'est
 * exactement la promesse de l'ADR 0021.
 */
export function astroYield(
  bodies: readonly CentralBody[],
  galaxyDepositBias: AstroYield,
  orbitRadius: number,
): AstroYield {
  const out: AstroYield = { ...galaxyDepositBias };

  let deposit = 1;
  let energy = 1;
  for (const body of bodies) {
    if (body.kind === "star") {
      deposit *= starClass(body.typeId).depositMult;
      energy *= starClass(body.typeId).energyMult;
    } else if (body.kind === "blackHole") {
      deposit *= blackHoleType(body.typeId).depositMult;
      energy *= blackHoleType(body.typeId).energyMult;
    } else {
      deposit *= whiteHoleType(body.typeId).depositMult;
      energy *= whiteHoleType(body.typeId).energyMult;
    }
  }

  const flux = Math.min(
    IRRADIANCE_YIELD_MAX,
    Math.max(
      IRRADIANCE_YIELD_MIN,
      irradianceAt(bodies, auAt(bodies, orbitRadius)),
    ),
  );

  for (const resource of ["ore", "metals", "food"] as const) {
    out[resource] = (out[resource] ?? 1) * deposit;
  }
  out.energy = (out.energy ?? 1) * energy * flux;
  return out;
}

/**
 * Danger de séjour dans un système, 0–5 (chantier 45.2).
 *
 * Le **maximum** et non la somme : ce qui tue dans un système est son objet le plus hostile,
 * et deux étoiles calmes ne font pas un pulsar. Pour une étoile, c'est son rayonnement qui
 * fait le danger ; pour une singularité, son `hazard` catalogue, qui dit aussi les marées et
 * l'imprévisibilité — un dormant est à 5 sans rien émettre.
 *
 * Entre dans le coût de trajet **à l'arrivée**, jamais dans le poids d'une arête : le graphe
 * reste de la géométrie pure, sans quoi `travel.calibration.test.ts` cesserait de mesurer ce
 * qu'il mesure.
 */
export function systemHazard(bodies: readonly CentralBody[]): number {
  return bodies.reduce((worst, body) => {
    const danger =
      body.kind === "star"
        ? starClass(body.typeId).radiation
        : body.kind === "blackHole"
          ? blackHoleType(body.typeId).hazard
          : whiteHoleType(body.typeId).hazard;
    return Math.max(worst, danger);
  }, 0);
}

/**
 * Surcoût de carburant d'un convoi arrivant dans un système dangereux.
 *
 * Manœuvres d'évitement, blindage, marge de sécurité : traverser un système à pulsar coûte,
 * et c'est ce qui donne un prix au danger sans inventer de mécanique nouvelle. À 5, le
 * convoi consomme 60 % de plus.
 */
export function hazardFuelMult(hazard: number): number {
  return 1 + Math.max(0, Math.min(5, hazard)) * 0.12;
}

// ── Habitabilité ─────────────────────────────────────────────────────────────

/**
 * Bandes de vivabilité : minimum, **optimum**, maximum.
 *
 * L'optimum est donné, et non déduit du milieu de la bande. Les trois sont asymétriques —
 * on descend plus bas en pression qu'on ne monte, et une gravité faible se supporte mieux
 * qu'une gravité forte — et prendre le milieu arithmétique reviendrait à décréter que la
 * Terre, à 1 bar dans une bande 0,4–4, n'est qu'à un tiers de l'idéal.
 */
const TEMPERATE_C = [-60, 12, 60] as const;
const PRESSURE_BAR = [0.4, 1, 4] as const;
const GRAVITY_G = [0.25, 1, 2.2] as const;

/** Conditions de surface d'un corps, telles que la chaîne les produit. */
export interface SurfaceConditions {
  surfaceTempC: number;
  pressureBar: number;
  gravityG: number;
  /** 0–5, tel que `radiationAt` le rend. */
  radiation: number;
  breathable: boolean;
}

/**
 * Ce que vaut la bande à son bord, et le plancher vers lequel elle tend au-delà.
 *
 * Une falaise à zéro paraissait juste — au-delà de la bande, on ne vit pas — mais elle a
 * vidé la galaxie : 76 % des corps à zéro d'habitabilité, 27 % des systèmes avec un monde
 * viable, mesuré. Le défaut n'était pas dans les bornes mais dans ce que le nombre veut dire.
 *
 * L'habitabilité de ce jeu n'a jamais mesuré « est-ce la Terre ». Elle mesure **à quel point
 * l'environnement aide une colonie** — l'ancien modèle donnait 10 à 40 à un monde gelé, 5 à
 * 30 à un volcanique, et on y colonisait sous dôme. Un monde hostile doit donc être *pauvre*,
 * pas impossible ; l'impossible est réservé à ce qui n'a pas de sol.
 */
const BAND_EDGE = 0.12;

/**
 * Score de proximité à l'optimum d'une bande, entre 0 et 1.
 *
 * Vaut 1 à l'optimum, décroît linéairement jusqu'à `BAND_EDGE` au bord de la bande, puis
 * continue de décroître au-delà sans jamais atteindre zéro.
 */
function band(
  value: number,
  [min, best, max]: readonly [number, number, number],
): number {
  const span = value < best ? best - min : max - best;
  if (span <= 0) return 1;
  const t = Math.abs(value - best) / span;
  if (t <= 1) return 1 - (1 - BAND_EDGE) * t;
  return BAND_EDGE / (1 + (t - 1) * 1.5);
}

/**
 * Habitabilité, 0–100 — **calculée**, plus jamais tirée.
 *
 * C'est le point d'arrivée de toute la chaîne, et la raison d'être du chantier. La
 * température domine (une planète hors de la bande liquide ne vaut rien, quelles que soient
 * ses autres qualités), la pression et la gravité modulent, le rayonnement retranche, et
 * respirer double la valeur du reste.
 *
 * Le produit plutôt que la somme : un seul facteur rédhibitoire suffit à annuler le tout, ce
 * qui est le comportement voulu — on ne colonise pas un monde tempéré et écrasant.
 */
export function habitabilityOf(conditions: SurfaceConditions): number {
  const temperature = band(conditions.surfaceTempC, TEMPERATE_C);
  const pressure = band(conditions.pressureBar, PRESSURE_BAR);
  const gravity = band(conditions.gravityG, GRAVITY_G);
  const irradiated = Math.max(0.05, 1 - conditions.radiation / 6);
  const air = conditions.breathable ? 1 : 0.55;

  // Moyenne géométrique pondérée, et non un produit sec.
  //
  // Le produit laissait un seul facteur bas annuler l'ensemble : un monde gelé sortait à 1
  // d'habitabilité parce que sa température ET sa pression étaient mauvaises, alors qu'il
  // reste exploitable sous dôme. Les exposants disent ce qui compte le plus — la température
  // domine, la pression et la gravité modulent, le rayonnement pèse peu — sans qu'aucun
  // puisse à lui seul réduire le tout à rien.
  const score =
    temperature ** 0.45 *
    pressure ** 0.2 *
    gravity ** 0.2 *
    irradiated ** 0.4 *
    air;
  return Math.round(Math.min(100, score * 100));
}
