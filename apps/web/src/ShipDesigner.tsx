import {
  blueprintLoad,
  CHASSIS,
  CHASSIS_IDS,
  MODULES,
  MODULE_IDS,
  resolveBlueprint,
  SLOT_TYPES,
  validateBlueprint,
  type ChassisId,
  type EmpireEffects,
  type ModuleId,
  type ResourceId,
  type SlotType,
} from "@spacesim/shared";
import { useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Field,
  Gauge as SsGauge,
  Panel,
  Popover,
  Select,
} from "@spacesim/ui";
import { BlueprintList } from "./BlueprintList.js";
import { formatDuration } from "./format.js";
import {
  CHASSIS_LABELS,
  MODULE_LABELS,
  RESOURCE_LABELS,
  SLOT_LABELS,
} from "./labels.js";
import {
  ShipHullDiagram,
  slotPixelPosition,
  type SlotRef,
} from "./ShipHullDiagram.js";
import { useGameStore } from "./state/game-store.js";
import { selectActiveColony } from "./state/selectors.js";

/** Largeur/hauteur rendues du schéma de coque dans l'éditeur (non compact, cf. ShipHullDiagram). */
const HULL_SIZE = 200;
const HULL_HEIGHT = HULL_SIZE * 1.375;

const SLOT_LEGEND: { slot: SlotType; varName: string }[] = [
  { slot: "weapon", varName: "--slot-weapon" },
  { slot: "defense", varName: "--slot-defense" },
  { slot: "propulsion", varName: "--slot-propulsion" },
  { slot: "utility", varName: "--slot-utility" },
];

interface Props {
  effects: EmpireEffects;
}

const EMPTY = {
  name: "",
  chassisId: "" as ChassisId | "",
  modules: [] as ModuleId[],
};

/** En-tête label + used/max ; le remplissage lui-même vient du design system (chantier 21.6). */
function Gauge({
  label,
  used,
  max,
}: { label: string; used: number; max: number }) {
  const over = used > max;
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span>{label}</span>
        <span className={over ? "gauge-over" : "muted"}>
          {used}/{max}
        </span>
      </div>
      <SsGauge value={used} capacity={max} />
    </div>
  );
}

/** Concepteur de vaisseaux (chantier 13) : liste des plans + éditeur châssis/modules. */
export function ShipDesigner({ effects }: Props) {
  const [searchParams] = useSearchParams();
  const activeColony = useGameStore(
    selectActiveColony(searchParams.get("colony")),
  );
  const { blueprints, fleets, send } = useGameStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof EMPTY>(EMPTY);
  const [selectedSlot, setSelectedSlot] = useState<SlotRef | null>(null);

  const unlockedChassis = CHASSIS_IDS.filter((id) =>
    effects.unlockedChassis.has(id),
  );

  const startNew = () => {
    setEditingId(null);
    setDraft({ name: "", chassisId: unlockedChassis[0] ?? "", modules: [] });
    setSelectedSlot(null);
  };

  const startEdit = (id: string) => {
    const bp = blueprints.find((b) => b.id === id);
    if (!bp) return;
    setEditingId(id);
    setDraft({
      name: bp.name,
      chassisId: bp.chassisId as ChassisId,
      modules: [...(bp.modules as ModuleId[])],
    });
    setSelectedSlot(null);
  };

  const chassis = draft.chassisId ? CHASSIS[draft.chassisId] : null;
  const shape = { chassisId: draft.chassisId, modules: draft.modules };

  const stats = useMemo(
    () => (draft.chassisId ? resolveBlueprint(shape) : null),
    [draft],
  );
  const load = useMemo(() => blueprintLoad(shape), [draft]);
  const problems = useMemo(
    () =>
      draft.chassisId
        ? validateBlueprint(shape, effects)
        : ["Choisissez un châssis"],
    [draft, effects],
  );

  const slotUsed = (slot: SlotType) =>
    draft.modules.filter((m) => MODULES[m].slot === slot).length;

  const addModule = (id: ModuleId) =>
    setDraft((d) => ({ ...d, modules: [...d.modules, id] }));
  const removeModuleAt = (index: number) =>
    setDraft((d) => ({
      ...d,
      modules: d.modules.filter((_, i) => i !== index),
    }));
  const replaceModuleAt = (index: number, id: ModuleId) =>
    setDraft((d) => ({
      ...d,
      modules: d.modules.map((m, i) => (i === index ? id : m)),
    }));

  /** Module actuellement monté sur l'emplacement ciblé (nième module de ce type, index réel préservé). */
  const selectedModule = selectedSlot
    ? draft.modules
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => MODULES[m].slot === selectedSlot.type)[
        selectedSlot.index
      ]
    : undefined;

  /** Point d'ancrage (pixels) de l'emplacement ciblé, pour la ligne repère et le cadre de sélection. */
  const anchor =
    selectedSlot && draft.chassisId
      ? slotPixelPosition(
          draft.chassisId,
          selectedSlot.type,
          selectedSlot.index,
          HULL_SIZE,
        )
      : null;

  const handleSelectSlot = (slot: SlotRef) =>
    setSelectedSlot((cur) =>
      cur && cur.type === slot.type && cur.index === slot.index ? null : slot,
    );

  const pickModule = (id: ModuleId) => {
    if (!selectedSlot) return;
    if (selectedModule) replaceModuleAt(selectedModule.i, id);
    else addModule(id);
    setSelectedSlot(null);
  };

  const removeSelected = () => {
    if (selectedModule) removeModuleAt(selectedModule.i);
    setSelectedSlot(null);
  };

  const save = () => {
    if (!draft.chassisId || problems.length > 0) return;
    const payload = {
      name: draft.name,
      chassisId: draft.chassisId,
      modules: draft.modules,
    };
    send(
      editingId
        ? { type: "updateBlueprint", blueprintId: editingId, ...payload }
        : { type: "createBlueprint", ...payload },
    );
    startNew();
  };

  return (
    <div className="designer-layout">
      <Panel
        className="designer-list"
        title="Plans de vaisseaux"
        actions={<Button onClick={startNew}>+ Nouveau plan</Button>}
      >
        <BlueprintList
          blueprints={blueprints}
          activeColony={activeColony}
          fleets={fleets}
          editingId={editingId}
          onEdit={startEdit}
          send={send}
        />
      </Panel>

      <Panel
        className="designer-editor"
        title={editingId ? "Modifier le plan" : "Nouveau plan"}
      >
        <div className="designer-editor-body">
          <Field
            label="Nom"
            value={draft.name}
            placeholder="Nom du plan"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />

          <Select
            label="Châssis"
            value={draft.chassisId}
            onChange={(e) => {
              setDraft({
                name: draft.name,
                chassisId: e.target.value as ChassisId,
                modules: [],
              });
              setSelectedSlot(null);
            }}
            options={[
              { value: "", label: "— Choisir —" },
              ...unlockedChassis.map((id) => ({
                value: id,
                label: `${CHASSIS_LABELS[id].name} (${CHASSIS[id].domain === "colony" ? "civil" : "flotte"})`,
              })),
            ]}
          />

          {chassis && stats && (
            <>
              <p className="muted small">
                {CHASSIS_LABELS[chassis.id].description}
              </p>

              <div className="designer-preview">
                <div className="hull-diagram-wrap">
                  <ShipHullDiagram
                    chassisId={draft.chassisId}
                    modules={draft.modules}
                    selectedSlot={selectedSlot}
                    onSelectSlot={handleSelectSlot}
                  />
                  {anchor && (
                    <svg
                      className="slot-connector"
                      width={HULL_SIZE}
                      height={HULL_HEIGHT}
                    >
                      <line
                        x1={anchor.x}
                        y1={anchor.y}
                        x2={anchor.x}
                        y2={HULL_HEIGHT}
                      />
                    </svg>
                  )}
                </div>
                <div className="hull-legend">
                  {SLOT_LEGEND.map(({ slot, varName }) => (
                    <span key={slot} className="hull-legend-item">
                      <span
                        className="hull-legend-dot"
                        style={{ background: `var(${varName})` }}
                      />
                      {SLOT_LABELS[slot]}
                    </span>
                  ))}
                  <span className="muted small">
                    Cliquez un emplacement pour choisir un module.
                  </span>
                </div>
              </div>

              {selectedSlot && anchor && (
                <div
                  className="slot-popover-anchor"
                  style={{ "--notch-left": `${anchor.x}px` } as CSSProperties}
                >
                  <div className="slot-popover-notch" />
                  <Popover style={{ position: "relative" }}>
                    <div className="slot-popover-head">
                      <strong>{SLOT_LABELS[selectedSlot.type]}</strong>
                      {selectedModule && (
                        <button className="chip" onClick={removeSelected}>
                          {MODULE_LABELS[selectedModule.m].name} — Retirer
                        </button>
                      )}
                    </div>
                    <div className="fit-add">
                      {MODULE_IDS.filter(
                        (id) =>
                          MODULES[id].slot === selectedSlot.type &&
                          effects.unlockedModules.has(id),
                      ).map((id) => (
                        <button
                          key={id}
                          className={`chip add ${selectedModule?.m === id ? "active" : ""}`}
                          title={MODULE_LABELS[id].description}
                          onClick={() => pickModule(id)}
                        >
                          + {MODULE_LABELS[id].name}
                        </button>
                      ))}
                    </div>
                  </Popover>
                </div>
              )}

              <div className="gauges">
                <Gauge label="Énergie" used={load.power} max={chassis.power} />
                <Gauge
                  label="Tonnage"
                  used={load.tonnage}
                  max={chassis.tonnage}
                />
                <Gauge label="Calcul" used={load.calc} max={chassis.calc} />
              </div>

              {/* Emplacements montés */}
              <div className="fit-slots">
                {SLOT_TYPES.map((slot) => (
                  <div key={slot} className="fit-slot">
                    <div className="fit-slot-head">
                      <strong>{SLOT_LABELS[slot]}</strong>
                      <span
                        className={
                          slotUsed(slot) > chassis.slots[slot]
                            ? "gauge-over"
                            : "muted"
                        }
                      >
                        {slotUsed(slot)}/{chassis.slots[slot]}
                      </span>
                    </div>
                    <div className="fit-chips">
                      {draft.modules
                        .map((m, i) => ({ m, i }))
                        .filter(({ m }) => MODULES[m].slot === slot)
                        .map(({ m, i }) => (
                          <button
                            key={i}
                            className="chip"
                            onClick={() => removeModuleAt(i)}
                          >
                            {MODULE_LABELS[m].name} ×
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Récap stats */}
              <div className="stats-recap">
                <span>Coque {Math.round(stats.hull)}</span>
                <span>Bouclier {Math.round(stats.shield)}</span>
                <span>
                  Feu {Math.round(stats.weapons.long)}/
                  {Math.round(stats.weapons.medium)}/
                  {Math.round(stats.weapons.short)}
                </span>
                <span>Init. {Math.round(stats.initiative)}</span>
                {stats.capacity > 0 && (
                  <span>Soute {Math.round(stats.capacity)}</span>
                )}
                {stats.miningYield > 0 && (
                  <span>Minage {Math.round(stats.miningYield)}</span>
                )}
                {stats.colonizer && <span>Colonisateur</span>}
                <span>Vitesse ×{stats.speedMult.toFixed(2)}</span>
                <span>Carburant {Math.round(stats.fuelPerJump)}</span>
                <span className="muted">
                  {formatCost(stats.cost)} — {formatDuration(stats.buildMs)}
                </span>
              </div>

              {problems.length > 0 && (
                <ul className="problems">
                  {problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}

              <div className="editor-actions">
                <Button disabled={problems.length > 0} onClick={save}>
                  {editingId ? "Enregistrer" : "Créer le plan"}
                </Button>
                {editingId && (
                  <Button variant="link" onClick={startNew}>
                    Annuler
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return Object.entries(cost)
    .map(([res, n]) => `${Math.round(n)} ${RESOURCE_LABELS[res as ResourceId]}`)
    .join(" · ");
}
