import {
  CATEGORY_ADVANTAGE,
  COUNTER_BONUS,
  DIRECTIVE_COUNTER,
  DIRECTIVES,
  WARSHIP_CATEGORY,
  WARSHIP_IDS,
  WARSHIPS,
  type CombatDef,
} from "@spacesim/shared";
import { ContentRepository } from "./content-repository.js";
import type { ContentBundle, ContentWarship } from "./content-types.js";

const repo = new ContentRepository();

/**
 * Libellés français des classes historiques, dupliqués depuis `apps/web/src/labels.ts`
 * (`WARSHIP_LABELS`) — `apps/server` ne peut pas dépendre d'`apps/web` (sens interdit,
 * voir CLAUDE.md). Sept entrées, seed one-shot uniquement : un admin peut les modifier
 * ensuite, ce n'est plus la source d'affichage une fois la table peuplée.
 */
const SEED_WARSHIP_LABELS: Record<string, { name: string; description: string }> = {
  fighter: { name: "Chasseur", description: "Rapide, létal en mêlée. Domine les croiseurs." },
  frigate: {
    name: "Frégate",
    description: "Polyvalente à moyenne portée. Domine les chasseurs.",
  },
  cruiser: { name: "Croiseur", description: "Lourd, longue portée. Domine les frégates." },
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
};

/** Vaisseaux de guerre historiques (`packages/shared`) au format `ContentWarship`. */
function seedWarships(): ContentWarship[] {
  return WARSHIP_IDS.map((id) => {
    const def = WARSHIPS[id];
    const label = SEED_WARSHIP_LABELS[id];
    return {
      id,
      nameFr: label?.name ?? id,
      descriptionFr: label?.description ?? "",
      hull: def.hull,
      shield: def.shield,
      weapons: def.weapons,
      initiative: def.initiative,
      category: WARSHIP_CATEGORY[id],
      cost: def.cost,
      buildMs: def.buildMs,
      requiresTech: def.requiresTech,
      fleetDamageBonus: def.fleetDamageBonus ?? null,
    };
  });
}

/**
 * Amorce le contenu une fois dans la vie d'une base (idempotent, sûr à chaque boot —
 * même idiome que `BootstrapService.ensureNpcPopulation` : compter, compléter si vide).
 * Libellés français repris de `SEED_WARSHIP_LABELS` ci-dessus ; `apps/web/src/labels.ts`
 * garde son propre `WARSHIP_LABELS` en parallèle tant que ce domaine n'y est pas
 * entièrement migré — un admin peut déjà éditer `nameFr`/`descriptionFr` ici.
 */
export async function ensureContentSeeded(): Promise<void> {
  if ((await repo.countWarships()) === 0) {
    await repo.insertWarships(seedWarships());
  }
  if (!(await repo.hasTuning())) {
    await repo.insertTuning({
      categoryAdvantage: CATEGORY_ADVANTAGE,
      directives: DIRECTIVES,
      directiveCounter: DIRECTIVE_COUNTER,
      counterBonus: COUNTER_BONUS,
    });
  }
}

/** Charge tout le contenu depuis la DB — appelé au boot puis après chaque édition admin
 *  (remplacement en bloc de `GameRuntime.content`, jamais de mutation en place). */
export async function loadContentBundle(): Promise<ContentBundle> {
  const [warships, combatTuning] = await Promise.all([repo.loadWarships(), repo.loadTuning()]);
  return { warships, combatTuning };
}

/** Convertit les vaisseaux de guerre chargés en table de combat (`sim/military/combat.ts`
 *  `defs`) — même forme que `WARSHIP_COMBAT_DEFS`, sourcée depuis le contenu DB-backed. */
export function combatDefsFromWarships(
  warships: Record<string, ContentWarship>,
): Record<string, CombatDef> {
  return Object.fromEntries(
    Object.entries(warships).map(([id, w]) => [
      id,
      {
        hull: w.hull,
        shield: w.shield,
        weapons: w.weapons,
        initiative: w.initiative,
        fleetDamageBonus: w.fleetDamageBonus ?? 0,
        category: w.category,
      } satisfies CombatDef,
    ]),
  );
}

export { ContentRepository };
