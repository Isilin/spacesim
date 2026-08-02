import type { ClientMessage } from "@spacesim/protocol";
import {
  canAffordStation,
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  findGalaxyOfSystem,
  idleShips,
  INSTALLATION_IDS,
  INSTALLATIONS,
  jumpDistanceInUniverse,
  maxConvoyCapacity,
  RESOURCES,
  SHIP_IDS,
  ZONE_TYPE_IDS,
  ZONE_TYPES,
  type Colony,
  type EmpireEffects,
  type InstallationId,
  type ResourceId,
  type Route,
  type ShipId,
  type Station,
  type Universe,
  type ZoneTypeId,
} from "@spacesim/shared";
import { useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  ListRow,
  NumberInput,
  Panel,
  ProgressBar,
  RowHeader,
  Select,
} from "@spacesim/ui";
import { formatDuration, systemIdOf } from "./format.js";
import {
  INSTALLATION_LABELS,
  RESOURCE_LABELS,
  SHIP_LABELS,
  ZONE_TYPE_LABELS,
} from "./labels.js";
import { useGameStore } from "./state/game-store.js";

interface Props {
  effects: EmpireEffects;
  universe: Universe;
  portalLinks: [string, string][];
}

function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return Object.entries(cost)
    .map(([res, amount]) => `${amount} ${RESOURCE_LABELS[res as ResourceId]}`)
    .join(" · ");
}

/** Horloge locale pour les comptes à rebours (les timers font foi côté serveur). */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
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
 * Onglet « Stations » (chantier 24.10) : miroir de `ColonyView.tsx` — sélecteur si
 * plusieurs stations, ressources, zones/installations construites via une file
 * séquentielle (comme `Colony.queue`, sans plafond — voir `sim/industry/station.ts`),
 * transfert de ressources depuis une colonie.
 */
export function StationsView({ effects, universe, portalLinks }: Props) {
  const { stations, colonies, routes, send } = useGameStore();
  const now = useNow();
  const [stationId, setStationId] = useState<string | null>(null);
  const station =
    stations.find((s) => s.id === stationId) ?? stations[0] ?? null;

  if (!station) {
    return (
      <p className="muted">Aucune station — fondez-en une depuis la carte.</p>
    );
  }

  return (
    <div className="colony-view">
      <div className="colony-header">
        <h2>{station.name}</h2>
        {stations.length > 1 && (
          <Select
            value={station.id}
            onChange={(e) => setStationId(e.target.value)}
            options={stations.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
      </div>

      <div className="resource-bar">
        {RESOURCES.map((res) => (
          <div key={res} className="resource-cell">
            <span className="resource-name">{RESOURCE_LABELS[res]}</span>
            <span className="resource-stock">
              {Math.floor(station.resources[res])}
            </span>
          </div>
        ))}
      </div>

      <div className="colony-columns">
        <Panel title="Zones">
          <ul className="building-list">
            {ZONE_TYPE_IDS.map((id) => {
              const def = ZONE_TYPES[id];
              const locked = !effects.unlockedZoneTypes.has(id);
              if (locked) {
                return (
                  <ListRow
                    key={id}
                    title={ZONE_TYPE_LABELS[id].name}
                    meta="🔒 verrouillé — technologie non recherchée"
                  />
                );
              }
              const count = station.zones[id] ?? 0;
              const queued = station.zoneQueue.filter(
                (q) => q.zoneTypeId === id,
              ).length;
              const affordable = canAffordStation(station, def.cost);
              return (
                <ListRow
                  key={id}
                  title={ZONE_TYPE_LABELS[id].name}
                  level={`×${count}${queued > 0 ? ` (+${queued})` : ""}`}
                  meta={`${ZONE_TYPE_LABELS[id].description} · ${formatCost(def.cost)} — ${formatDuration(def.buildMs)}`}
                  right={
                    <Button
                      size="sm"
                      disabled={!affordable}
                      title={!affordable ? "Ressources insuffisantes" : ""}
                      onClick={() =>
                        send({
                          type: "buildZone",
                          stationId: station.id,
                          zoneTypeId: id,
                        })
                      }
                    >
                      Construire
                    </Button>
                  }
                />
              );
            })}
          </ul>
        </Panel>

        <Panel title="Installations">
          <ul className="building-list">
            {INSTALLATION_IDS.map((id) => {
              const def = INSTALLATIONS[id];
              const locked = !effects.unlockedInstallations.has(id);
              if (locked) {
                return (
                  <ListRow
                    key={id}
                    title={INSTALLATION_LABELS[id].name}
                    meta={`🔒 verrouillé — technologie non recherchée · ${ZONE_TYPE_LABELS[def.zoneType].name}`}
                  />
                );
              }
              const count = station.installations[id] ?? 0;
              const queued = station.installQueue.filter(
                (q) => q.installationId === id,
              ).length;
              const zoneSlots = station.zones[def.zoneType] ?? 0;
              const slotsFull =
                installationsOfZoneType(station, def.zoneType) >= zoneSlots;
              const affordable = canAffordStation(station, def.cost);
              const disabled = slotsFull || !affordable;
              return (
                <ListRow
                  key={id}
                  title={INSTALLATION_LABELS[id].name}
                  level={`×${count}${queued > 0 ? ` (+${queued})` : ""}`}
                  meta={`${ZONE_TYPE_LABELS[def.zoneType].name} · ${formatCost(def.cost)} — ${formatDuration(def.buildMs)}`}
                  right={
                    <Button
                      size="sm"
                      disabled={disabled}
                      title={
                        slotsFull
                          ? "Plus d'emplacement dans ce type de zone"
                          : !affordable
                            ? "Ressources insuffisantes"
                            : ""
                      }
                      onClick={() =>
                        send({
                          type: "buildInstallation",
                          stationId: station.id,
                          installationId: id,
                        })
                      }
                    >
                      Construire
                    </Button>
                  }
                />
              );
            })}
          </ul>
        </Panel>

        <Panel
          title={`File de construction — ${station.zoneQueue.length + station.installQueue.length}`}
        >
          {station.zoneQueue.length === 0 &&
          station.installQueue.length === 0 ? (
            <EmptyState>Aucune construction en cours.</EmptyState>
          ) : (
            <ul className="queue-list">
              {station.zoneQueue.map((item) => {
                const total = item.finishesAt - item.startedAt;
                const progress =
                  now < item.startedAt
                    ? 0
                    : Math.min(1, (now - item.startedAt) / total);
                return (
                  <li
                    key={`z-${item.zoneTypeId}-${item.startedAt}`}
                    className="queue-item"
                  >
                    <RowHeader
                      label={
                        ZONE_TYPE_LABELS[item.zoneTypeId as ZoneTypeId].name
                      }
                      value={formatDuration(item.finishesAt - now)}
                    />
                    <ProgressBar value={progress * 100} max={100} />
                  </li>
                );
              })}
              {station.installQueue.map((item) => {
                const total = item.finishesAt - item.startedAt;
                const progress =
                  now < item.startedAt
                    ? 0
                    : Math.min(1, (now - item.startedAt) / total);
                return (
                  <li
                    key={`i-${item.installationId}-${item.startedAt}`}
                    className="queue-item"
                  >
                    <RowHeader
                      label={
                        INSTALLATION_LABELS[
                          item.installationId as InstallationId
                        ].name
                      }
                      value={formatDuration(item.finishesAt - now)}
                    />
                    <ProgressBar value={progress * 100} max={100} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <StationTransferForm
          station={station}
          colonies={colonies}
          routes={routes}
          universe={universe}
          portalLinks={portalLinks}
          now={now}
          send={send}
        />
      </div>
    </div>
  );
}

interface TransferProps {
  station: Station;
  colonies: Colony[];
  routes: Route[];
  universe: Universe;
  portalLinks: [string, string][];
  now: number;
  send: (msg: ClientMessage) => void;
}

const CARGO_RESOURCES: ResourceId[] = [
  "ore",
  "metals",
  "components",
  "food",
  "goods",
];

/**
 * Transfert colonie → station (chantier 24.6/24.10) : même devis qu'un convoi
 * inter-colonies (`TransferPanel.tsx`), destination fixée à la station active plutôt
 * que choisie dans une liste.
 */
function StationTransferForm({
  station,
  colonies,
  routes,
  universe,
  portalLinks,
  now,
  send,
}: TransferProps) {
  const [fromColonyId, setFromColonyId] = useState("");
  const [amounts, setAmounts] = useState<Partial<Record<ResourceId, string>>>(
    {},
  );
  const [shipCounts, setShipCounts] = useState<Partial<Record<ShipId, string>>>(
    {},
  );

  const portalsBetween = (fromSystemId: string, toSystemId: string): number => {
    const a = findGalaxyOfSystem(universe, fromSystemId)?.id;
    const b = findGalaxyOfSystem(universe, toSystemId)?.id;
    if (!a || !b || a === b) return 0;
    return a === "gal-0" || b === "gal-0" ? 1 : 2;
  };

  const source = colonies.find((c) => c.id === fromColonyId) ?? colonies[0];
  const fromSystem = source ? systemIdOf(universe, source.planetId) : undefined;
  const jumps =
    fromSystem && station.systemId
      ? jumpDistanceInUniverse(
          universe,
          fromSystem,
          station.systemId,
          portalLinks,
        )
      : -1;

  const cargo: Partial<Record<ResourceId, number>> = {};
  for (const res of CARGO_RESOURCES) {
    const n = Math.floor(Number(amounts[res] ?? ""));
    if (Number.isFinite(n) && n > 0) cargo[res] = n;
  }
  const hasCargo = Object.keys(cargo).length > 0;
  const totalCargo = Object.values(cargo).reduce((s, n) => s + n, 0);

  const idle: Partial<Record<ShipId, number>> = source
    ? idleShips(source, routes)
    : {};
  const convoy: Partial<Record<ShipId, number>> = {};
  for (const shipId of SHIP_IDS) {
    const n = Math.floor(Number(shipCounts[shipId] ?? ""));
    if (Number.isFinite(n) && n > 0) convoy[shipId] = n;
  }
  const hasConvoy = Object.keys(convoy).length > 0;
  const capacity = hasConvoy
    ? convoyCapacity(convoy)
    : source
      ? maxConvoyCapacity(source, routes)
      : 0;
  const overCapacity = totalCargo > capacity;

  const portals =
    jumps > 0 && fromSystem ? portalsBetween(fromSystem, station.systemId) : 0;
  const eta = jumps >= 0 ? convoyDurationMs(jumps, convoy) : 0;
  const fuel =
    jumps >= 0 && hasConvoy ? convoyFuel(jumps, convoy, totalCargo) : 0;
  const fees = jumps >= 0 ? convoyFees(jumps, portals) : 0;
  const orbitalEnergy = source
    ? Math.floor(source.orbitalResources.energy ?? 0)
    : 0;
  const missingFuel = fuel > orbitalEnergy;

  return (
    <Panel title="Transfert vers la station">
      {colonies.length === 0 ? (
        <p className="muted small">
          Aucune colonie pour approvisionner la station.
        </p>
      ) : (
        <div className="form-stack">
          <Select
            label="Colonie d'origine"
            value={source?.id ?? ""}
            onChange={(e) => setFromColonyId(e.target.value)}
            options={colonies.map((c) => ({ value: c.id, label: c.name }))}
          />
          {CARGO_RESOURCES.map((res) => (
            <NumberInput
              key={res}
              label={`${RESOURCE_LABELS[res]} (orbite : ${Math.floor(source?.orbitalResources[res] ?? 0)})`}
              min={0}
              max={Math.floor(source?.orbitalResources[res] ?? 0)}
              value={amounts[res] ?? ""}
              placeholder="0"
              onChange={(e) =>
                setAmounts({ ...amounts, [res]: e.target.value })
              }
            />
          ))}

          <span className="small muted">Convoi</span>
          {SHIP_IDS.map((shipId) => (
            <NumberInput
              key={shipId}
              label={`${SHIP_LABELS[shipId].name} (dispo : ${idle[shipId] ?? 0})`}
              min={0}
              max={idle[shipId] ?? 0}
              value={shipCounts[shipId] ?? ""}
              placeholder="0"
              onChange={(e) =>
                setShipCounts({ ...shipCounts, [shipId]: e.target.value })
              }
            />
          ))}

          {jumps >= 0 && (
            <span className="small muted">
              {jumps} saut{jumps > 1 ? "s" : ""}
              {portals > 0
                ? ` · ${portals} portail${portals > 1 ? "s" : ""}`
                : ""}{" "}
              — {formatDuration(eta)} — {fees} crédits
              {hasConvoy ? ` · ${fuel} énergie` : ""}
            </span>
          )}
          <span className={`small ${overCapacity ? "ko" : "muted"}`}>
            Soute {hasConvoy ? "du convoi" : "disponible"} : {capacity}
            {overCapacity ? ` — cargaison trop lourde (${totalCargo})` : ""}
          </span>
          {hasConvoy && missingFuel && (
            <span className="small ko">
              Carburant insuffisant en orbite : {fuel} requis, {orbitalEnergy}{" "}
              disponible.
            </span>
          )}
          <Button
            disabled={
              !hasCargo ||
              !source ||
              overCapacity ||
              capacity === 0 ||
              (hasConvoy && missingFuel)
            }
            onClick={() => {
              if (!source) return;
              send({
                type: "transfer",
                fromColonyId: source.id,
                toId: station.id,
                toKind: "station",
                resources: cargo,
                ...(hasConvoy ? { ships: convoy } : {}),
              });
              setAmounts({});
              setShipCounts({});
            }}
          >
            Envoyer le convoi
          </Button>
        </div>
      )}
    </Panel>
  );
}
