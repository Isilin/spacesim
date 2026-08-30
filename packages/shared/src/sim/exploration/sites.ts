import type { ResourceId } from "../../model/resources.js";
import type { StarSystem } from "../../model/universe.js";
import { createRng, randInt } from "../../rng.js";
import { type OrbitalElements, orbitPosition, type Vec3 } from "./geometry.js";

/**
 * Sites découvrables au scan (chantier 31.11). Le chantier 31 a ouvert du volume
 * intra-système ; sans rien à y trouver, la 3D locale ne servirait qu'à moduler un prix
 * de transfert.
 *
 * Comme le reste de l'univers, les sites sont **dérivés du seed** : ni générés une fois
 * ni persistés, ils se recalculent à l'identique à chaque appel. Seul l'état de
 * découverte d'un empire est stocké, à l'image de `explored`.
 */
export const SITE_KINDS = ["wreck", "anomaly", "cache"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

export interface SystemSite extends OrbitalElements {
  id: string;
  systemId: string;
  kind: SiteKind;
  /** Butin remis une fois, à la résolution du scan qui l'a révélé. */
  reward: Partial<Record<ResourceId, number>>;
}

/** Butin type par nature de site — l'épave paie en matériaux, la cache en crédits. */
const REWARD_TABLE: Record<
  SiteKind,
  readonly (readonly [ResourceId, number, number])[]
> = {
  wreck: [
    ["metals", 40, 120],
    ["components", 10, 35],
  ],
  anomaly: [
    ["science", 25, 80],
    ["energy", 20, 60],
  ],
  cache: [
    ["credits", 60, 200],
    ["goods", 10, 40],
  ],
};

/**
 * Sites d'un système, déterministes pour une seed et un système donnés. Zéro à trois :
 * un système vide reste le cas courant, sans quoi scanner deviendrait une formalité
 * plutôt qu'un pari.
 */
export function sitesOfSystem(
  seed: string,
  system: StarSystem,
  depositBonus = 1,
): SystemSite[] {
  const rng = createRng(`${seed}:sites:${system.id}`);
  const count = Math.max(0, randInt(rng, -1, 3));
  const sites: SystemSite[] = [];

  // Les sites se tiennent au-delà des orbites connues : c'est le vide entre les corps
  // qu'on explore, pas les planètes déjà cataloguées.
  const outermost = Math.max(
    120,
    ...system.planets.map((p) => p.orbitRadius),
    ...system.belts.map((b) => b.orbitRadius),
  );

  for (let i = 1; i <= count; i++) {
    const kind = SITE_KINDS[randInt(rng, 0, SITE_KINDS.length - 1)]!;
    const reward: Partial<Record<ResourceId, number>> = {};
    for (const [resource, min, max] of REWARD_TABLE[kind]) {
      reward[resource] = Math.round(randInt(rng, min, max) * depositBonus);
    }
    sites.push({
      id: `${system.id}-site${i}`,
      systemId: system.id,
      kind,
      orbitRadius: outermost + randInt(rng, 40, 200),
      orbitAngle: rng() * Math.PI * 2,
      inclination: (rng() - 0.5) * 0.8,
      ascendingNode: rng() * Math.PI * 2,
      reward,
    });
  }
  return sites;
}

/**
 * Position d'un site dans le repère de son système. Les sites ne tournent pas : une
 * épave à la dérive n'a pas de période orbitale utile au joueur, et une position figée
 * rend le site retrouvable après l'avoir repéré.
 */
export function sitePosition(site: SystemSite): Vec3 {
  return orbitPosition(site);
}

/** Butin cumulé d'un lot de sites — ce que rapporte un scan qui les révèle tous. */
export function sitesReward(
  sites: readonly SystemSite[],
): Partial<Record<ResourceId, number>> {
  const total: Partial<Record<ResourceId, number>> = {};
  for (const site of sites) {
    for (const [resource, amount] of Object.entries(site.reward) as [
      ResourceId,
      number,
    ][]) {
      total[resource] = (total[resource] ?? 0) + amount;
    }
  }
  return total;
}
