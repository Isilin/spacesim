import type { ClientMessage } from "@spacesim/protocol";
import {
  canAffordStation,
  INSTALLATION_IDS,
  INSTALLATIONS,
  ZONE_TYPE_IDS,
  ZONE_TYPES,
  type EmpireEffects,
  type InstallationId,
  type ResourceId,
  type Station,
  type StationZone,
  type ZoneTypeId,
} from "@spacesim/shared";
import { Panel } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format.js";
import { installationLabel, resourceLabel, zoneTypeLabel } from "./labels.js";

export type BuildSelection =
  | { kind: "growthPoint"; q: number; r: number }
  | { kind: "zone"; zone: StationZone };

interface Props {
  station: Station;
  effects: EmpireEffects;
  selection: BuildSelection | null;
  send: (msg: ClientMessage) => void;
}

function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return Object.entries(cost)
    .map(([res, amount]) => `${amount} ${resourceLabel(res as ResourceId)}`)
    .join(" · ");
}

/** Installations construites + en file d'un type de zone (miroir du privé côté serveur). */
function installationsOfZoneType(
  station: Station,
  zoneType: ZoneTypeId,
): number {
  const built = (
    Object.entries(station.installations) as [InstallationId, number][]
  ).reduce(
    (sum, [id, count]) =>
      sum + (INSTALLATIONS[id]?.zoneType === zoneType ? (count ?? 0) : 0),
    0,
  );
  const queued = station.installQueue.filter(
    (q) =>
      INSTALLATIONS[q.installationId as InstallationId]?.zoneType === zoneType,
  ).length;
  return built + queued;
}

/**
 * Sélecteur « quoi construire » du constructeur spatial (chantier 26) : docké sous le
 * diagramme plutôt qu'en popover flottant (le diagramme pan/zoome, un connecteur ancré
 * à un pixel casserait — voir plan). Paramétré par le type de sélection courante : un
 * point de croissance propose les types de zone (26.7), une zone bâtie propose ses
 * installations valides (26.8).
 */
export function StationBuildPicker({
  station,
  effects,
  selection,
  send,
}: Props) {
  const { t } = useTranslation();
  if (!selection) {
    return (
      <Panel title={t("stationBuildPicker.build")}>
        <p className="muted small">{t("stationBuildPicker.selectHint")}</p>
      </Panel>
    );
  }

  if (selection.kind === "growthPoint") {
    const { q, r } = selection;
    return (
      <Panel title={t("stationBuildPicker.newZone")}>
        <div className="fit-add">
          {ZONE_TYPE_IDS.map((id) => {
            const def = ZONE_TYPES[id];
            const locked = !effects.unlockedZoneTypes.has(id);
            const affordable = !locked && canAffordStation(station, def.cost);
            const disabled = locked || !affordable;
            return (
              <button
                key={id}
                type="button"
                className="chip add"
                disabled={disabled}
                title={
                  locked
                    ? t("stationBuildPicker.techLocked")
                    : !affordable
                      ? t("stationBuildPicker.notAffordable")
                      : t("stationBuildPicker.costHint", {
                          cost: formatCost(def.cost),
                          duration: formatDuration(def.buildMs),
                        })
                }
                onClick={() =>
                  send({
                    type: "buildZone",
                    stationId: station.id,
                    zoneTypeId: id,
                    q,
                    r,
                  })
                }
              >
                {zoneTypeLabel(id).name}
              </button>
            );
          })}
        </div>
      </Panel>
    );
  }

  const { zone } = selection;
  const zoneType = zone.zoneTypeId as ZoneTypeId;
  const candidates = INSTALLATION_IDS.filter(
    (id) => INSTALLATIONS[id].zoneType === zoneType,
  );
  const zoneSlots = station.zones.filter(
    (z) => z.zoneTypeId === zoneType,
  ).length;
  const slotsFull = installationsOfZoneType(station, zoneType) >= zoneSlots;

  return (
    <Panel
      title={t("stationBuildPicker.installations", {
        zone: zoneTypeLabel(zoneType)?.name ?? zoneType,
      })}
    >
      {candidates.length === 0 ? (
        <p className="muted small">{t("stationBuildPicker.noInstallation")}</p>
      ) : (
        <div className="fit-add">
          {candidates.map((id) => {
            const def = INSTALLATIONS[id];
            const locked = !effects.unlockedInstallations.has(id);
            const affordable = !locked && canAffordStation(station, def.cost);
            const disabled = locked || slotsFull || !affordable;
            return (
              <button
                key={id}
                type="button"
                className="chip add"
                disabled={disabled}
                title={
                  locked
                    ? t("stationBuildPicker.techLocked")
                    : slotsFull
                      ? t("stationBuildPicker.slotsFull")
                      : !affordable
                        ? t("stationBuildPicker.notAffordable")
                        : t("stationBuildPicker.costHint", {
                            cost: formatCost(def.cost),
                            duration: formatDuration(def.buildMs),
                          })
                }
                onClick={() =>
                  send({
                    type: "buildInstallation",
                    stationId: station.id,
                    installationId: id,
                  })
                }
              >
                {installationLabel(id).name}
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
