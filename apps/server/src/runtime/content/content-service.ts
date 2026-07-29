import {
  CATEGORY_ADVANTAGE,
  COUNTER_BONUS,
  DIRECTIVE_COUNTER,
  DIRECTIVES,
  FACTION_IDS,
  FACTIONS,
  WARSHIP_CATEGORY,
  WARSHIP_IDS,
  WARSHIPS,
  type CombatDef,
} from "@spacesim/shared";
import { ContentRepository } from "./content-repository.js";
import type { ContentBundle, ContentFaction, ContentWarship } from "./content-types.js";

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
 * Descriptions étendues des factions, dupliquées depuis `apps/web/src/labels.ts`
 * (`FACTION_LABELS`) — même raison que `SEED_WARSHIP_LABELS` ci-dessus. `name`/`color`
 * n'ont pas besoin de ce traitement : `content/factions.ts` les porte déjà en canonique.
 */
const SEED_FACTION_DESCRIPTIONS: Record<string, string> = {
  ferride: "Forges orbitales et chaînes de montage. Vend le métal, paie cher les vivres.",
  ostara_league: "Les greniers de la galaxie. Vend nourriture et biens, achète l'industrie.",
  aether_cartel: "Réacteurs, minerai brut et discrétion. Vend l'énergie, achète le raffiné.",
};

/** Factions historiques (`packages/shared`) au format `ContentFaction`. */
function seedFactions(): ContentFaction[] {
  return FACTION_IDS.map((id) => {
    const def = FACTIONS[id];
    return {
      id,
      name: def.name,
      color: def.color,
      descriptionFr: SEED_FACTION_DESCRIPTIONS[id] ?? "",
      produces: def.produces,
      consumes: def.consumes,
    };
  });
}

/**
 * Amorce le contenu une fois dans la vie d'une base (idempotent, sûr à chaque boot —
 * même idiome que `BootstrapService.ensureNpcPopulation` : compter, compléter si vide).
 * Libellés français repris des tables `SEED_*` ci-dessus ; `apps/web/src/labels.ts` garde
 * ses propres tables en parallèle tant que ces domaines n'y sont pas entièrement migrés —
 * un admin peut déjà éditer les champs français ici.
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
  if ((await repo.countFactions()) === 0) {
    await repo.insertFactions(seedFactions());
  }
}

/** Charge tout le contenu depuis la DB — appelé au boot puis après chaque édition admin
 *  (remplacement en bloc de `GameRuntime.content`, jamais de mutation en place). */
export async function loadContentBundle(): Promise<ContentBundle> {
  const [warships, combatTuning, factions] = await Promise.all([
    repo.loadWarships(),
    repo.loadTuning(),
    repo.loadFactions(),
  ]);
  return { warships, combatTuning, factions };
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
