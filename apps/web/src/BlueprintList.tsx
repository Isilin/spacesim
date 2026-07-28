import type { ClientMessage } from "@spacesim/protocol";
import {
  CHASSIS,
  resolveBlueprint,
  type Blueprint,
  type Colony,
  type Fleet,
  type ModuleId,
  type ResourceId,
} from "@spacesim/shared";
import { useState } from "react";
import { Button, Select } from "@spacesim/ui";
import { formatDuration } from "./format.js";
import { CHASSIS_LABELS, RESOURCE_LABELS } from "./labels.js";
import { ShipHullDiagram } from "./ShipHullDiagram.js";

interface Props {
  blueprints: Blueprint[];
  activeColony: Colony | null;
  fleets: Fleet[];
  editingId: string | null;
  onEdit: (id: string) => void;
  send: (msg: ClientMessage) => void;
}

function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return Object.entries(cost)
    .map(([res, n]) => `${Math.round(n)} ${RESOURCE_LABELS[res as ResourceId]}`)
    .join(" · ");
}

/** Liste des plans de l'empire : produire (colonie/flotte), éditer, supprimer. */
export function BlueprintList({
  blueprints,
  activeColony,
  fleets,
  editingId,
  onEdit,
  send,
}: Props) {
  const [fleetChoice, setFleetChoice] = useState<Record<string, string>>({});

  if (blueprints.length === 0) {
    return <p className="muted small">Aucun plan. Concevez votre premier vaisseau ci-contre.</p>;
  }

  return (
    <ul className="building-list">
      {blueprints.map((bp) => {
        const stats = resolveBlueprint(bp);
        const chassis = CHASSIS[bp.chassisId as keyof typeof CHASSIS];
        const chassisName =
          CHASSIS_LABELS[bp.chassisId as keyof typeof CHASSIS_LABELS]?.name ?? bp.chassisId;
        const isColony = stats.domain === "colony";
        const targetFleetId = fleetChoice[bp.id] ?? fleets[0]?.id ?? "";
        const canBuildColony = isColony && !!activeColony;
        const canBuildFleet = !isColony && fleets.length > 0;
        return (
          <li key={bp.id} className={`building ${editingId === bp.id ? "locked" : ""}`}>
            <ShipHullDiagram
              chassisId={bp.chassisId as keyof typeof CHASSIS}
              modules={bp.modules as ModuleId[]}
              compact
            />
            <div className="building-info">
              <div className="building-head">
                <strong>{bp.name}</strong>
                <span className="level">{chassisName}</span>
                <span className="muted small">{isColony ? "civil" : "flotte"}</span>
              </div>
              <span className="muted small">
                {isColony
                  ? `Soute ${Math.round(stats.capacity)}${stats.miningYield > 0 ? ` · minage ${Math.round(stats.miningYield)}` : ""}${stats.colonizer ? " · colonisateur" : ""}`
                  : `Coque ${Math.round(stats.hull)} · bouclier ${Math.round(stats.shield)} · feu ${Math.round(stats.weapons.long + stats.weapons.medium + stats.weapons.short)}`}
              </span>
              <span className="small">
                {formatCost(stats.cost)} — {formatDuration(stats.buildMs)}
              </span>
            </div>
            <div className="blueprint-actions">
              {!isColony && (
                <Select
                  value={targetFleetId}
                  onChange={(e) => setFleetChoice((c) => ({ ...c, [bp.id]: e.target.value }))}
                  disabled={fleets.length === 0}
                  options={
                    fleets.length === 0
                      ? [{ value: "", label: "Aucune flotte" }]
                      : fleets.map((f) => ({ value: f.id, label: f.name }))
                  }
                />
              )}
              <Button
                disabled={isColony ? !canBuildColony : !canBuildFleet}
                title={
                  isColony
                    ? canBuildColony
                      ? ""
                      : "Aucune colonie active"
                    : canBuildFleet
                      ? ""
                      : "Créez une flotte d'abord (onglet Flottes)"
                }
                onClick={() =>
                  send(
                    isColony
                      ? { type: "buildBlueprint", blueprintId: bp.id, colonyId: activeColony!.id }
                      : { type: "buildBlueprint", blueprintId: bp.id, fleetId: targetFleetId },
                  )
                }
              >
                Produire
              </Button>
              <Button variant="link" onClick={() => onEdit(bp.id)}>
                Éditer
              </Button>
              <Button
                variant="link"
                onClick={() => send({ type: "deleteBlueprint", blueprintId: bp.id })}
              >
                Supprimer
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
