import type { CentralBody } from "../../model/universe.js";
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
        ? starClass(body.typeId).radiation +
          starClass(body.typeId).flareActivity
        : body.kind === "blackHole"
          ? blackHoleType(body.typeId).radiation
          : whiteHoleType(body.typeId).radiation;
    return sum + output / (d * d);
  }, 0);
  return Math.min(5, total);
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

// ── Habitabilité ─────────────────────────────────────────────────────────────

/**
 * Bandes de vivabilité : minimum, **optimum**, maximum.
 *
 * L'optimum est donné, et non déduit du milieu de la bande. Les trois sont asymétriques —
 * on descend plus bas en pression qu'on ne monte, et une gravité faible se supporte mieux
 * qu'une gravité forte — et prendre le milieu arithmétique reviendrait à décréter que la
 * Terre, à 1 bar dans une bande 0,4–4, n'est qu'à un tiers de l'idéal.
 */
const TEMPERATE_C = [-15, 15, 45] as const;
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
 * Score de proximité à l'optimum d'une bande, entre 0 et 1.
 *
 * Vaut 1 à l'optimum, décroît linéairement de part et d'autre à des pentes différentes, et
 * tombe à zéro dès qu'on sort de la bande — une falaise plutôt qu'une pente, parce qu'au-delà
 * on ne vit pas.
 */
function band(
  value: number,
  [min, best, max]: readonly [number, number, number],
): number {
  if (value <= min || value >= max) return 0;
  const span = value < best ? best - min : max - best;
  if (span <= 0) return 1;
  return 1 - Math.abs(value - best) / span;
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
  if (temperature <= 0) return 0;
  const pressure = band(conditions.pressureBar, PRESSURE_BAR);
  const gravity = band(conditions.gravityG, GRAVITY_G);
  if (pressure <= 0 || gravity <= 0) return 0;

  // Le rayonnement retranche au lieu de multiplier : un monde par ailleurs parfait reste
  // exploitable sous un ciel dur, il n'est pas annulé.
  const irradiated = Math.max(0, 1 - conditions.radiation / 6);
  const air = conditions.breathable ? 1 : 0.55;

  const score =
    temperature * pressure ** 0.5 * gravity ** 0.5 * irradiated * air;
  return Math.round(Math.min(100, score * 100));
}
