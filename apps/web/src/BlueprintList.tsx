import type { ClientMessage } from "@spacesim/protocol";
import {
  CHASSIS,
  resolveBlueprint,
  type Blueprint,
  type ChassisId,
  type Colony,
  type Fleet,
  type ModuleId,
  type ResourceId,
} from "@spacesim/shared";
import { useState } from "react";
import { Button, Select } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format.js";
import { chassisLabel, resourceLabel } from "./labels.js";
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
    .map(([res, n]) => `${Math.round(n)} ${resourceLabel(res as ResourceId)}`)
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
  const { t } = useTranslation();
  const [fleetChoice, setFleetChoice] = useState<Record<string, string>>({});

  if (blueprints.length === 0) {
    return <p className="muted small">{t("blueprintList.empty")}</p>;
  }

  return (
    <ul className="building-list">
      {blueprints.map((bp) => {
        const stats = resolveBlueprint(bp);
        const chassisName =
          chassisLabel(bp.chassisId as ChassisId)?.name ?? bp.chassisId;
        const isColony = stats.domain === "colony";
        const targetFleetId = fleetChoice[bp.id] ?? fleets[0]?.id ?? "";
        const canBuildColony = isColony && !!activeColony;
        const canBuildFleet = !isColony && fleets.length > 0;
        return (
          <li
            key={bp.id}
            className={`building ${editingId === bp.id ? "locked" : ""}`}
          >
            <ShipHullDiagram
              chassisId={bp.chassisId as keyof typeof CHASSIS}
              modules={bp.modules as ModuleId[]}
              compact
            />
            <div className="building-info">
              <div className="building-head">
                <strong>{bp.name}</strong>
                <span className="level">{chassisName}</span>
                <span className="muted small">
                  {isColony
                    ? t("blueprintList.domainColony")
                    : t("blueprintList.domainFleet")}
                </span>
              </div>
              <span className="muted small">
                {isColony
                  ? t("blueprintList.colonyStats", {
                      capacity: Math.round(stats.capacity),
                      mining:
                        stats.miningYield > 0
                          ? t("blueprintList.miningSuffix", {
                              yield: Math.round(stats.miningYield),
                            })
                          : "",
                      colonizer: stats.colonizer
                        ? t("blueprintList.colonizerSuffix")
                        : "",
                    })
                  : t("blueprintList.fleetStats", {
                      hull: Math.round(stats.hull),
                      shield: Math.round(stats.shield),
                      weapons: Math.round(
                        stats.weapons.long +
                          stats.weapons.medium +
                          stats.weapons.short,
                      ),
                    })}
              </span>
              <span className="small">
                {formatCost(stats.cost)} — {formatDuration(stats.buildMs)}
              </span>
            </div>
            <div className="blueprint-actions">
              {!isColony && (
                <Select
                  value={targetFleetId}
                  onChange={(e) =>
                    setFleetChoice((c) => ({ ...c, [bp.id]: e.target.value }))
                  }
                  disabled={fleets.length === 0}
                  options={
                    fleets.length === 0
                      ? [{ value: "", label: t("blueprintList.noFleet") }]
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
                      : t("blueprintList.noActiveColony")
                    : canBuildFleet
                      ? ""
                      : t("blueprintList.createFleetFirst")
                }
                onClick={() =>
                  send(
                    isColony
                      ? {
                          type: "buildBlueprint",
                          blueprintId: bp.id,
                          colonyId: activeColony!.id,
                        }
                      : {
                          type: "buildBlueprint",
                          blueprintId: bp.id,
                          fleetId: targetFleetId,
                        },
                  )
                }
              >
                {t("blueprintList.produce")}
              </Button>
              <Button variant="link" onClick={() => onEdit(bp.id)}>
                {t("blueprintList.edit")}
              </Button>
              <Button
                variant="link"
                onClick={() =>
                  send({ type: "deleteBlueprint", blueprintId: bp.id })
                }
              >
                {t("blueprintList.remove")}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
