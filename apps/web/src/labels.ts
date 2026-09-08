import type {
  BodyRef,
  BuildingId,
  CentralBodyKind,
  ChassisId,
  CombatDirective,
  FactionId,
  FactionMood,
  InstallationId,
  LegacyShipId,
  ModuleId,
  ModuleRole,
  ObjectiveKind,
  RelationState,
  ResourceId,
  SlotType,
  StationMarketAccess,
  TechBranch,
  TechId,
  WarshipId,
  WorldEventKind,
  ZoneTypeId,
} from "@spacesim/shared";
import { i18n } from "./i18n.js";

/** Toutes les fonctions ci-dessous résolvent leur texte via i18next (chantier 27.17) — les
 *  clés (ids stables de `@spacesim/shared`) vivent dans `src/i18n/content.ts`. Le ton/icône
 *  des badges reste en code (pas de texte affiché, donc rien à traduire). */

const t = (key: string) => i18n.t(key);

/** Humeur de faction (chantier 15) : nom + ton d'affichage (neutre/positif/négatif). */
export function factionMoodLabel(mood: FactionMood): {
  name: string;
  tone: "muted" | "ok" | "ko";
} {
  const tone: Record<FactionMood, "muted" | "ok" | "ko"> = {
    neutral: "muted",
    boom: "ok",
    shortage: "ok",
    embargo: "ko",
  };
  return { name: t(`factionMood.${mood}`), tone: tone[mood] };
}

/** Badge de relation diplomatique (chantier 16), affiché à côté du nom d'un empire. */
export function relationBadge(state: RelationState): string {
  return t(`relationBadge.${state}`);
}

/** Politique de marché d'une station (chantier 25) : palier minimal de relation
 * requis pour qu'un visiteur puisse y commercer. */
export function stationMarketAccessLabel(access: StationMarketAccess): {
  name: string;
  description: string;
} {
  return {
    name: t(`stationMarketAccess.${access}.name`),
    description: t(`stationMarketAccess.${access}.description`),
  };
}

/** Objectif éphémère (chantier 17), affiché dans le fil du monde. */
export function objectiveKindLabel(kind: ObjectiveKind): string {
  return t(`objectiveKind.${kind}`);
}

/** Événement de monde (chantier 17), affiché dans le fil du monde. */
export function worldEventLabel(kind: WorldEventKind): {
  name: string;
  icon: string;
  tone: "ok" | "ko";
} {
  const meta: Record<WorldEventKind, { icon: string; tone: "ok" | "ko" }> = {
    economic_crisis: { icon: "📉", tone: "ko" },
    gold_rush: { icon: "💰", tone: "ok" },
    pirate_surge: { icon: "☠", tone: "ko" },
    faction_boom: { icon: "📈", tone: "ok" },
  };
  return { name: t(`worldEvent.${kind}.name`), ...meta[kind] };
}

/**
 * Nom d'un corps, sur ses deux axes (chantier 45.3).
 *
 * Deux fonctions et non une chaîne composée : la fiche veut « Rocheuse tempérée », la liste
 * du système veut « Tempérée » seul, et l'infobox veut la classe. Composer ici aurait forcé
 * les trois à découper.
 *
 * Le corps entier plutôt que ses identifiants : une lune se nomme dans ses propres
 * catalogues, et « regular » n'a pas de traduction du côté planétaire.
 */
export function bodyClassLabel(body: BodyRef): string {
  return t(
    `${body.kind === "moon" ? "moonClass" : "planetClass"}.${body.classId}`,
  );
}

export function bodyVariantLabel(body: BodyRef): string {
  return t(
    `${body.kind === "moon" ? "moonVariant" : "planetVariant"}.${body.variantId}`,
  );
}

export function resourceLabel(resource: ResourceId): string {
  return t(`resource.${resource}`);
}

export function buildingLabel(id: BuildingId): {
  name: string;
  description: string;
} {
  return {
    name: t(`building.${id}.name`),
    description: t(`building.${id}.description`),
  };
}

/** Paliers de réputation, du plus haut au plus bas (aligné sur REP_TIERS). Les seuils restent
 *  en code (non traduisibles) ; seul le nom du palier vient d'i18next. */
const REP_TIERS = [
  { min: 800, key: "ally" },
  { min: 300, key: "partner" },
  { min: 100, key: "associate" },
  { min: 0, key: "neutral" },
] as const;

export function repTierName(rep: number): string {
  const tier = REP_TIERS.find((tr) => rep >= tr.min) ?? REP_TIERS[3];
  return t(`repTier.${tier.key}`);
}

/** Libellé d'un vaisseau par id (classe historique) ; repli sur l'id pour les plans. */
export function shipLabel(id: string): { name: string; description: string } {
  const legacyIds: LegacyShipId[] = [
    "cargo_small",
    "cargo_large",
    "hauler",
    "courier",
  ];
  if (!legacyIds.includes(id as LegacyShipId))
    return { name: id, description: "" };
  const legacyId = id as LegacyShipId;
  return {
    name: t(`ship.${legacyId}.name`),
    description: t(`ship.${legacyId}.description`),
  };
}

/** Description étendue par faction — le nom canonique vit aussi dans `content/factions.ts` (shared). */
export function factionLabel(id: FactionId): {
  name: string;
  description: string;
} {
  return {
    name: t(`faction.${id}.name`),
    description: t(`faction.${id}.description`),
  };
}

export function branchLabel(branch: TechBranch): string {
  return t(`branch.${branch}`);
}

export function warshipLabel(id: WarshipId): {
  name: string;
  description: string;
} {
  return {
    name: t(`warship.${id}.name`),
    description: t(`warship.${id}.description`),
  };
}

// ── Conception de vaisseaux (chantier 13) ──────────────────────────────────

export function slotLabel(slot: SlotType): string {
  return t(`slot.${slot}`);
}

export function roleLabel(role: ModuleRole): string {
  return t(`role.${role}`);
}

export function chassisLabel(id: ChassisId): {
  name: string;
  description: string;
} {
  return {
    name: t(`chassis.${id}.name`),
    description: t(`chassis.${id}.description`),
  };
}

export function moduleLabel(id: ModuleId): {
  name: string;
  description: string;
} {
  return {
    name: t(`module.${id}.name`),
    description: t(`module.${id}.description`),
  };
}

export function directiveLabel(directive: CombatDirective): {
  name: string;
  hint: string;
} {
  return {
    name: t(`directive.${directive}.name`),
    hint: t(`directive.${directive}.hint`),
  };
}

export function techLabel(id: TechId): { name: string; description: string } {
  return {
    name: t(`tech.${id}.name`),
    description: t(`tech.${id}.description`),
  };
}

/** Type de zone de station orbitale (chantier 24) — même libellés que le seed admin
 *  (`content-service.ts`), le client recalculant depuis les tables statiques. */
export function zoneTypeLabel(id: ZoneTypeId): {
  name: string;
  description: string;
} {
  return {
    name: t(`zoneType.${id}.name`),
    description: t(`zoneType.${id}.description`),
  };
}

/** Installation de station orbitale (chantier 24) — même libellés que le seed admin. */
export function installationLabel(id: InstallationId): {
  name: string;
  description: string;
} {
  return {
    name: t(`installation.${id}.name`),
    description: t(`installation.${id}.description`),
  };
}

/**
 * Libellé d'un corps central — étoile, trou noir ou fontaine blanche (chantiers 35.10 puis 46).
 *
 * Le corps entier plutôt que son seul identifiant, et pour la même raison que
 * `bodyClassLabel` : c'est `kind` qui dit dans quel catalogue lire, et « stellar » nomme un
 * trou noir quand « pulsar » nomme une étoile. Un identifiant seul ne pouvait pas trancher.
 *
 * Repli sur l'identifiant brut plutôt que sur du vide : un type ajouté sans traduction doit
 * rester lisible. C'est aussi ce qui a masqué le défaut que ce chantier corrige — la table
 * i18n portait encore les six identifiants dérivés d'avant le chantier 45, aucune clé ne
 * correspondait, et l'infobox rendait `orange_dwarf` sans que rien ne signale l'absence.
 * D'où le test de couverture qui accompagne ces tables.
 */
export function centralBodyLabel(body: {
  kind: CentralBodyKind;
  typeId: string;
}): string {
  const table =
    body.kind === "star"
      ? "starClass"
      : body.kind === "blackHole"
        ? "blackHoleType"
        : "whiteHoleType";
  return i18n.t(`${table}.${body.typeId}`, { defaultValue: body.typeId });
}
