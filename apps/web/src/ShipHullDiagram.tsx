import {
  CHASSIS,
  MODULES,
  SLOT_TYPES,
  type ChassisId,
  type ChassisKind,
  type ModuleId,
  type SlotType,
} from "@spacesim/shared";
import { MODULE_LABELS } from "./labels.js";

interface Props {
  chassisId: ChassisId | "";
  /** Modules montés, dans l'ordre du plan (sert aussi à retrouver l'index réel au clic). */
  modules: ModuleId[];
  /** Miniature en liste (BlueprintList) : plus petit, sans étiquettes ni interaction. */
  compact?: boolean;
  /** Cliquer un emplacement occupé le retire (édition uniquement). */
  onRemoveAt?: (index: number) => void;
}

/** Silhouette de coque par famille de châssis (repère "0 0 160 220", nez en haut). */
const HULL_PATHS: Record<ChassisKind, string> = {
  generic: "M80 10 L115 60 L105 200 L80 215 L55 200 L45 60 Z",
  military: "M80 5 L95 60 L150 110 L100 130 L95 210 L65 210 L60 130 L10 110 L65 60 Z",
  freighter:
    "M70 15 L90 15 L90 40 L130 55 L130 175 L90 190 L90 210 L70 210 L70 190 L30 175 L30 55 L70 40 Z",
  miner: "M80 5 L88 40 L125 70 L120 180 L80 210 L40 180 L35 70 L72 40 Z",
  colonizer:
    "M80 10 C130 10 140 70 130 110 C140 150 120 200 80 215 C40 200 20 150 30 110 C20 70 30 10 80 10 Z",
  explorer: "M80 5 L88 100 L140 130 L100 140 L92 210 L68 210 L60 140 L20 130 L72 100 Z",
};

/** Plus gros tonnage du catalogue (battlecruiser) — sert de référence à l'échelle. */
const MAX_TONNAGE = 240;

/** Position verticale de la bande de chaque type d'emplacement (nez en haut). */
const BAND_Y: Record<SlotType, number> = {
  weapon: 55,
  utility: 108,
  defense: 150,
  propulsion: 192,
};
/** Demi-largeur de la bande — les emplacements s'y répartissent symétriquement. */
const BAND_HALF_WIDTH: Record<SlotType, number> = {
  weapon: 42,
  utility: 46,
  defense: 40,
  propulsion: 30,
};

function slotPositions(type: SlotType, count: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  const y = BAND_Y[type];
  const hw = BAND_HALF_WIDTH[type];
  if (count === 1) return [{ x: 80, y }];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1) - 0.5;
    return { x: 80 + t * 2 * hw, y };
  });
}

/** Regroupe les modules par type d'emplacement, en conservant leur index réel dans le plan. */
function groupBySlot(modules: ModuleId[]): Record<SlotType, { id: ModuleId; index: number }[]> {
  const groups: Record<SlotType, { id: ModuleId; index: number }[]> = {
    weapon: [],
    defense: [],
    propulsion: [],
    utility: [],
  };
  modules.forEach((id, index) => {
    const def = MODULES[id];
    if (def) groups[def.slot].push({ id, index });
  });
  return groups;
}

/**
 * Schéma de coque (chantier 13) : silhouette par famille de châssis + emplacements positionnés,
 * à la Stellaris/Endless Space. Purement visuel — les mécaniques (slots, budgets) restent
 * calculées par `sim/design.ts`, ce composant ne fait que les représenter.
 */
export function ShipHullDiagram({ chassisId, modules, compact, onRemoveAt }: Props) {
  const chassis = chassisId ? CHASSIS[chassisId] : null;
  const size = compact ? 72 : 200;

  if (!chassis) {
    return (
      <div
        className={`hull-diagram ${compact ? "compact" : ""} empty`}
        style={{ width: size, height: size * 1.375 }}
      >
        <span className="muted small">Aucun châssis</span>
      </div>
    );
  }

  const scale = 0.75 + 0.5 * Math.min(1, chassis.tonnage / MAX_TONNAGE);
  const grouped = groupBySlot(modules);

  return (
    <div className={`hull-diagram ${compact ? "compact" : ""}`}>
      <svg viewBox="0 0 160 220" width={size} height={size * 1.375}>
        <g transform={`translate(80 110) scale(${scale}) translate(-80 -110)`}>
          <path d={HULL_PATHS[chassis.kind]} className="hull-shape" />
        </g>
        {SLOT_TYPES.map((type) =>
          Array.from({ length: chassis.slots[type] }, (_, i) => {
            const pos = slotPositions(type, chassis.slots[type])[i]!;
            const filled = grouped[type][i];
            const label = filled ? MODULE_LABELS[filled.id].name : undefined;
            const clickable = !!(filled && onRemoveAt);
            return (
              <g
                key={`${type}-${i}`}
                transform={`translate(${pos.x} ${pos.y})`}
                className={`hull-slot slot-${type} ${filled ? "filled" : "empty"} ${clickable ? "clickable" : ""}`}
                onClick={clickable ? () => onRemoveAt(filled.index) : undefined}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? `Retirer ${label}` : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRemoveAt(filled.index);
                        }
                      }
                    : undefined
                }
              >
                {label && <title>{label}</title>}
                <circle r={compact ? 5 : 8} />
                {!compact && filled && (
                  <text y={compact ? 0 : 18} textAnchor="middle" className="hull-slot-label">
                    {label}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
