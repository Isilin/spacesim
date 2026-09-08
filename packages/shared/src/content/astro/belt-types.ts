import {
  type AstroOverrides,
  NO_ASTRO_OVERRIDES,
  patched,
} from "./overrides.js";
import type { BeltType, OrbitZone } from "../../model/universe.js";

/**
 * Types de ceintures d'astéroïdes (chantier 45.3).
 *
 * ## La première fois que ce type existe
 *
 * Une ceinture était une orbite, un nom et `{ ore: 1,2 à 2,0 }` — le même anneau gris partout,
 * dont la seule variété tenait à un tirage de richesse. Elles sont pourtant le seul objet du
 * jeu dont l'exploitation ne demande pas de coloniser quoi que ce soit, et le seul dont le
 * rendement passe par `beltRichness` plutôt que par la chaîne physique.
 *
 * ## Un seul axe, et pourquoi
 *
 * Pas de croisement classe × variante ici : une ceinture n'a ni gravité, ni atmosphère, ni
 * température de surface qui compte. Ce qui la distingue est sa COMPOSITION, qui est à la fois
 * sa structure et son environnement. Six entrées suffisent donc à dire tout ce qu'il y a à
 * dire, et un second axe n'aurait rien porté.
 *
 * L'affinité se lit par zone thermique, comme pour les planètes : c'est la ligne des glaces
 * qui sépare une ceinture silicatée d'une ceinture glacée, exactement comme dans le vrai
 * système solaire — la ceinture principale est en deçà, celle de Kuiper au-delà.
 */

export interface BeltTypeDef {
  id: string;

  // ── Entrées de génération — jamais éditables ──

  /** Affinité par zone thermique. Un poids nul interdit le type dans cette zone. */
  zoneWeights: Record<OrbitZone, number>;

  // ── Effets ──

  /**
   * Richesse en minerai, lue par `beltRichness` : c'est le seul chiffre que voit un
   * avant-poste minier, et il multiplie directement `MINING_RATE`.
   */
  richness: readonly [number, number];
  /**
   * Gisements SECONDAIRES : [ressource, probabilité, min, max], comme pour les corps.
   *
   * Jamais de minerai — `richness` le porte déjà, et deux sources pour la même ressource se
   * seraient écrasées l'une l'autre en silence. Le type l'interdit plutôt qu'un commentaire.
   */
  depositTendencies: readonly (readonly [
    "energy" | "food",
    number,
    number,
    number,
  ])[];
  /**
   * Danger de la ceinture, 0–5 — collisions, densité, instabilité.
   *
   * Il ne renchérit PAS le franchissement : `geometry.ts` exclut délibérément les ceintures
   * du repère de position (« un anneau n'a pas UNE position »), et le graphe de sauts doit
   * rester de la géométrie pure. Il entre par le danger du SYSTÈME, comme celui d'une
   * singularité.
   */
  hazard: number;

  // ── Habillage ──

  /** Teinte des astéroïdes. Remplace la déduction depuis les gisements. */
  tint: string;
  /** Densité apparente de l'anneau, 0–1 : un champ de débris est dense, une troyenne clairsemée. */
  density: number;
}

export interface StaticBeltTypeDef extends BeltTypeDef {
  id: BeltType;
}

export const BELT_TYPE_DEFS: Record<BeltType, StaticBeltTypeDef> = {
  // Vestige d'un noyau planétaire brisé : fer et nickel presque purs. La meilleure ceinture
  // du jeu, et la plus rare — Psyché n'a pas d'équivalent ailleurs.
  metallic: {
    id: "metallic",
    zoneWeights: { inner: 4, habitable: 3, outer: 2, frozen: 1 },
    richness: [1.8, 2.6],
    depositTendencies: [["energy", 0.4, 0.6, 1.0]],
    hazard: 1,
    tint: "#9aa6b4",
    density: 0.5,
  },
  // Silicates ordinaires : la ceinture principale, celle qu'on exploite sans se poser de
  // question. Le repli du catalogue, et le cas le plus fréquent.
  silicate: {
    id: "silicate",
    zoneWeights: { inner: 5, habitable: 6, outer: 4, frozen: 1 },
    richness: [1.1, 1.7],
    depositTendencies: [["energy", 0.3, 0.5, 0.9]],
    hazard: 0,
    tint: "#8a7f6c",
    density: 0.45,
  },
  // Chondrites carbonées : sombres, pauvres en métal, mais chargées de composés organiques et
  // d'eau liée. Peu de minerai, de quoi nourrir un avant-poste.
  carbonaceous: {
    id: "carbonaceous",
    zoneWeights: { inner: 2, habitable: 4, outer: 5, frozen: 3 },
    richness: [0.8, 1.3],
    depositTendencies: [
      ["food", 0.6, 0.7, 1.2],
      ["energy", 0.5, 0.6, 1.0],
    ],
    hazard: 0,
    tint: "#4e463c",
    density: 0.55,
  },
  // Au-delà de la ligne des glaces : eau, ammoniac, méthane. Ce qu'on y prend n'est pas du
  // minerai, c'est du volatil — et c'est ce qui fait vivre une base loin de tout.
  icy: {
    id: "icy",
    zoneWeights: { inner: 0, habitable: 1, outer: 5, frozen: 6 },
    richness: [0.6, 1.1],
    depositTendencies: [
      ["energy", 0.8, 1.0, 1.5],
      ["food", 0.5, 0.6, 1.0],
    ],
    hazard: 0,
    tint: "#b8d0dc",
    density: 0.35,
  },
  // Piégée aux points de Lagrange d'une géante : clairsemée, stable, tranquille. Rendement
  // modeste, aucun risque, et elle ne bouge jamais.
  trojan: {
    id: "trojan",
    zoneWeights: { inner: 1, habitable: 2, outer: 5, frozen: 4 },
    richness: [0.9, 1.4],
    depositTendencies: [["food", 0.3, 0.4, 0.8]],
    hazard: 0,
    tint: "#6f6353",
    density: 0.25,
  },
  // Collision récente : le champ n'a pas fini de se disperser. Densité extrême, gisements de
  // surface exceptionnels, et une chance sur deux d'y perdre un cargo.
  debris: {
    id: "debris",
    zoneWeights: { inner: 3, habitable: 3, outer: 3, frozen: 2 },
    richness: [2.0, 3.0],
    depositTendencies: [["energy", 0.6, 0.8, 1.3]],
    hazard: 3,
    tint: "#a89078",
    density: 0.85,
  },
};

/** Repli neutre — la ceinture la plus banale, comme les autres catalogues de `astro/`. */
const GENERIC_BELT: BeltTypeDef = BELT_TYPE_DEFS.silicate;

export function beltType(
  id: string,
  overrides: AstroOverrides = NO_ASTRO_OVERRIDES,
): BeltTypeDef {
  return patched<BeltTypeDef>(
    BELT_TYPE_DEFS[id as BeltType] ?? GENERIC_BELT,
    overrides.belt?.[id],
  );
}

/**
 * Table de tirage des types de ceinture pour une zone donnée.
 *
 * Vide si aucun type n'a d'affinité — l'appelant retombe alors sur son propre repli plutôt
 * que de recevoir un tirage impossible.
 */
export function beltTypesForZone(
  zone: OrbitZone,
): readonly (readonly [BeltType, number])[] {
  return Object.values(BELT_TYPE_DEFS)
    .map((def) => [def.id, def.zoneWeights[zone]] as const)
    .filter(([, weight]) => weight > 0);
}
