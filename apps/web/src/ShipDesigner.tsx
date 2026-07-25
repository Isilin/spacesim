import {
  blueprintLoad,
  CHASSIS,
  CHASSIS_IDS,
  MODULES,
  MODULE_IDS,
  resolveBlueprint,
  SLOT_TYPES,
  validateBlueprint,
  type Blueprint,
  type ChassisId,
  type ClientMessage,
  type Colony,
  type EmpireEffects,
  type Fleet,
  type ModuleId,
  type ResourceId,
  type SlotType,
} from "@spacesim/shared";
import { useMemo, useState } from "react";
import { BlueprintList } from "./BlueprintList.js";
import { formatDuration } from "./format.js";
import { CHASSIS_LABELS, MODULE_LABELS, RESOURCE_LABELS, SLOT_LABELS } from "./labels.js";

interface Props {
  blueprints: Blueprint[];
  effects: EmpireEffects;
  activeColony: Colony | null;
  fleets: Fleet[];
  send: (msg: ClientMessage) => void;
}

const EMPTY = { name: "", chassisId: "" as ChassisId | "", modules: [] as ModuleId[] };

function Gauge({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const over = used > max;
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span>{label}</span>
        <span className={over ? "gauge-over" : "muted"}>
          {used}/{max}
        </span>
      </div>
      <div className="gauge-track">
        <div className={`gauge-fill${over ? " over" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Concepteur de vaisseaux (chantier 13) : liste des plans + éditeur châssis/modules. */
export function ShipDesigner({ blueprints, effects, activeColony, fleets, send }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof EMPTY>(EMPTY);

  const unlockedChassis = CHASSIS_IDS.filter((id) => effects.unlockedChassis.has(id));

  const startNew = () => {
    setEditingId(null);
    setDraft({ name: "", chassisId: unlockedChassis[0] ?? "", modules: [] });
  };

  const startEdit = (id: string) => {
    const bp = blueprints.find((b) => b.id === id);
    if (!bp) return;
    setEditingId(id);
    setDraft({ name: bp.name, chassisId: bp.chassisId as ChassisId, modules: [...(bp.modules as ModuleId[])] });
  };

  const chassis = draft.chassisId ? CHASSIS[draft.chassisId] : null;
  const shape = { chassisId: draft.chassisId, modules: draft.modules };

  const stats = useMemo(() => (draft.chassisId ? resolveBlueprint(shape) : null), [draft]);
  const load = useMemo(() => blueprintLoad(shape), [draft]);
  const problems = useMemo(
    () => (draft.chassisId ? validateBlueprint(shape, effects) : ["Choisissez un châssis"]),
    [draft, effects],
  );

  const slotUsed = (slot: SlotType) => draft.modules.filter((m) => MODULES[m].slot === slot).length;

  const addModule = (id: ModuleId) => setDraft((d) => ({ ...d, modules: [...d.modules, id] }));
  const removeModuleAt = (index: number) =>
    setDraft((d) => ({ ...d, modules: d.modules.filter((_, i) => i !== index) }));

  const save = () => {
    if (!draft.chassisId || problems.length > 0) return;
    const payload = { name: draft.name, chassisId: draft.chassisId, modules: draft.modules };
    send(
      editingId
        ? { type: "updateBlueprint", blueprintId: editingId, ...payload }
        : { type: "createBlueprint", ...payload },
    );
    startNew();
  };

  return (
    <div className="designer-layout">
      <section className="designer-list">
        <div className="panel-head">
          <h3>Plans de vaisseaux</h3>
          <button onClick={startNew}>+ Nouveau plan</button>
        </div>
        <BlueprintList
          blueprints={blueprints}
          activeColony={activeColony}
          fleets={fleets}
          editingId={editingId}
          onEdit={startEdit}
          send={send}
        />
      </section>

      <section className="designer-editor">
        <h3>{editingId ? "Modifier le plan" : "Nouveau plan"}</h3>

        <label className="field">
          <span>Nom</span>
          <input
            value={draft.name}
            placeholder="Nom du plan"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>

        <label className="field">
          <span>Châssis</span>
          <select
            value={draft.chassisId}
            onChange={(e) =>
              setDraft({ name: draft.name, chassisId: e.target.value as ChassisId, modules: [] })
            }
          >
            <option value="">— Choisir —</option>
            {unlockedChassis.map((id) => (
              <option key={id} value={id}>
                {CHASSIS_LABELS[id].name} ({CHASSIS[id].domain === "colony" ? "civil" : "flotte"})
              </option>
            ))}
          </select>
        </label>

        {chassis && stats && (
          <>
            <p className="muted small">{CHASSIS_LABELS[chassis.id].description}</p>

            <div className="gauges">
              <Gauge label="Énergie" used={load.power} max={chassis.power} />
              <Gauge label="Tonnage" used={load.tonnage} max={chassis.tonnage} />
              <Gauge label="Calcul" used={load.calc} max={chassis.calc} />
            </div>

            {/* Emplacements montés */}
            <div className="fit-slots">
              {SLOT_TYPES.map((slot) => (
                <div key={slot} className="fit-slot">
                  <div className="fit-slot-head">
                    <strong>{SLOT_LABELS[slot]}</strong>
                    <span className={slotUsed(slot) > chassis.slots[slot] ? "gauge-over" : "muted"}>
                      {slotUsed(slot)}/{chassis.slots[slot]}
                    </span>
                  </div>
                  <div className="fit-chips">
                    {draft.modules
                      .map((m, i) => ({ m, i }))
                      .filter(({ m }) => MODULES[m].slot === slot)
                      .map(({ m, i }) => (
                        <button key={i} className="chip" onClick={() => removeModuleAt(i)}>
                          {MODULE_LABELS[m].name} ×
                        </button>
                      ))}
                  </div>
                  <div className="fit-add">
                    {MODULE_IDS.filter(
                      (id) => MODULES[id].slot === slot && effects.unlockedModules.has(id),
                    ).map((id) => (
                      <button
                        key={id}
                        className="chip add"
                        disabled={slotUsed(slot) >= chassis.slots[slot]}
                        title={MODULE_LABELS[id].description}
                        onClick={() => addModule(id)}
                      >
                        + {MODULE_LABELS[id].name}
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
                Feu {Math.round(stats.weapons.long)}/{Math.round(stats.weapons.medium)}/
                {Math.round(stats.weapons.short)}
              </span>
              <span>Init. {Math.round(stats.initiative)}</span>
              {stats.capacity > 0 && <span>Soute {Math.round(stats.capacity)}</span>}
              {stats.miningYield > 0 && <span>Minage {Math.round(stats.miningYield)}</span>}
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
              <button disabled={problems.length > 0} onClick={save}>
                {editingId ? "Enregistrer" : "Créer le plan"}
              </button>
              {editingId && (
                <button className="link-button" onClick={startNew}>
                  Annuler
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return Object.entries(cost)
    .map(([res, n]) => `${Math.round(n)} ${RESOURCE_LABELS[res as ResourceId]}`)
    .join(" · ");
}
