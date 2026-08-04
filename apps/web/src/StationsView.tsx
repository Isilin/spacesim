import type { ClientMessage } from "@spacesim/protocol";
import {
  computeGrowthPoints,
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  findGalaxyOfSystem,
  hexKey,
  idleShips,
  jumpDistanceInUniverse,
  maxConvoyCapacity,
  RESOURCES,
  SHIP_IDS,
  STATION_MARKET_ACCESS_IDS,
  type Colony,
  type EmpireEffects,
  type InstallationId,
  type ResourceId,
  type Route,
  type ShipId,
  type Station,
  type StationMarketAccess,
  type StationZone,
  type Universe,
  type ZoneTypeId,
} from "@spacesim/shared";
import { useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  NumberInput,
  Panel,
  ProgressBar,
  RowHeader,
  Select,
} from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { formatDuration, systemIdOf } from "./format.js";
import {
  StationBuildPicker,
  type BuildSelection,
} from "./StationBuildPicker.js";
import { StationDiagram } from "./StationDiagram.js";
import {
  installationLabel,
  resourceLabel,
  shipLabel,
  stationMarketAccessLabel,
  zoneTypeLabel,
} from "./labels.js";
import { useGameStore } from "./state/game-store.js";

interface Props {
  effects: EmpireEffects;
  universe: Universe;
  portalLinks: [string, string][];
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

/**
 * Onglet « Stations » (chantier 24.10, constructeur spatial chantier 26) : miroir de
 * `ColonyView.tsx` — sélecteur si plusieurs stations, ressources, zones/installations
 * construites via une file séquentielle (comme `Colony.queue`, sans plafond — voir
 * `sim/industry/station.ts`), transfert de ressources depuis une colonie.
 */
export function StationsView({ effects, universe, portalLinks }: Props) {
  const { t } = useTranslation();
  const { stations, colonies, routes, send } = useGameStore();
  const now = useNow();
  const [stationId, setStationId] = useState<string | null>(null);
  const [selection, setSelection] = useState<BuildSelection | null>(null);
  const station =
    stations.find((s) => s.id === stationId) ?? stations[0] ?? null;

  // Une sélection périmée (point de croissance désormais occupé, zone détruite —
  // aucun cas actuel, mais robuste si l'un ou l'autre change) ne doit pas rester
  // affichée : le sélecteur en dessous du plan doit refléter l'état courant.
  useEffect(() => {
    if (!station || !selection) return;
    if (selection.kind === "growthPoint") {
      const stillValid = computeGrowthPoints(station).some(
        (p) => p.q === selection.q && p.r === selection.r,
      );
      if (!stillValid) setSelection(null);
    } else {
      const stillBuilt = station.zones.some(
        (z) => hexKey(z.q, z.r) === hexKey(selection.zone.q, selection.zone.r),
      );
      if (!stillBuilt) setSelection(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.zones, station?.zoneQueue]);

  if (!station) {
    return <p className="muted">{t("stationsView.noStation")}</p>;
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
            <span className="resource-name">{resourceLabel(res)}</span>
            <span className="resource-stock">
              {Math.floor(station.resources[res])}
            </span>
          </div>
        ))}
      </div>

      <StationDiagram
        station={station}
        selectedGrowthPoint={
          selection?.kind === "growthPoint" ? selection : null
        }
        onSelectGrowthPoint={(p) =>
          setSelection({ kind: "growthPoint", q: p.q, r: p.r })
        }
        selectedZoneKey={
          selection?.kind === "zone"
            ? hexKey(selection.zone.q, selection.zone.r)
            : null
        }
        onSelectZone={(zone) => setSelection({ kind: "zone", zone })}
      />
      <StationBuildPicker
        station={station}
        effects={effects}
        selection={selection}
        send={send}
      />

      <div className="colony-columns">
        <Panel
          title={t("stationsView.buildQueue", {
            count: station.zoneQueue.length + station.installQueue.length,
          })}
        >
          {station.zoneQueue.length === 0 &&
          station.installQueue.length === 0 ? (
            <EmptyState>{t("stationsView.noBuild")}</EmptyState>
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
                      label={zoneTypeLabel(item.zoneTypeId as ZoneTypeId).name}
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
                        installationLabel(item.installationId as InstallationId)
                          .name
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

        <StationMarketPolicyForm station={station} send={send} />
      </div>
    </div>
  );
}

/**
 * Politique de marché d'une station (chantier 25) : accès (palier diplomatique
 * minimal requis pour un visiteur) et taxe prélevée sur ses échanges. Formulaire
 * local avec bouton d'envoi explicite (comme `StationTransferForm`), pas un
 * enregistrement au fil de la frappe — évite d'envoyer `setStationMarketPolicy` à
 * chaque caractère tapé dans le champ de taxe.
 */
function StationMarketPolicyForm({
  station,
  send,
}: {
  station: Station;
  send: (msg: ClientMessage) => void;
}) {
  const { t } = useTranslation();
  const [access, setAccess] = useState<StationMarketAccess>(
    station.marketAccess,
  );
  const [taxPercent, setTaxPercent] = useState(
    String(Math.round(station.marketTaxRate * 100)),
  );

  const dirty =
    access !== station.marketAccess ||
    taxPercent !== String(Math.round(station.marketTaxRate * 100));
  const taxRate = Math.min(1, Math.max(0, Number(taxPercent) / 100));
  const validTax = Number.isFinite(Number(taxPercent)) && taxPercent !== "";

  return (
    <Panel title={t("stationsView.marketPolicy")}>
      <div className="form-stack">
        <Select
          label={t("stationsView.access")}
          value={access}
          onChange={(e) => setAccess(e.target.value as StationMarketAccess)}
          options={STATION_MARKET_ACCESS_IDS.map((id) => ({
            value: id,
            label: stationMarketAccessLabel(id).name,
          }))}
        />
        <p className="muted small">
          {stationMarketAccessLabel(access).description}
        </p>
        <NumberInput
          label={t("stationsView.tax")}
          min={0}
          max={100}
          value={taxPercent}
          onChange={(e) => setTaxPercent(e.target.value)}
        />
        <Button
          disabled={!dirty || !validTax}
          onClick={() => {
            send({
              type: "setStationMarketPolicy",
              stationId: station.id,
              marketAccess: access,
              taxRate,
            });
          }}
        >
          {t("stationsView.apply")}
        </Button>
      </div>
    </Panel>
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
  const { t } = useTranslation();
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
    <Panel title={t("stationsView.transferToStation")}>
      {colonies.length === 0 ? (
        <p className="muted small">{t("stationsView.noColonySupply")}</p>
      ) : (
        <div className="form-stack">
          <Select
            label={t("stationsView.originColony")}
            value={source?.id ?? ""}
            onChange={(e) => setFromColonyId(e.target.value)}
            options={colonies.map((c) => ({ value: c.id, label: c.name }))}
          />
          {CARGO_RESOURCES.map((res) => (
            <NumberInput
              key={res}
              label={t("transferPanel.resourceOrbit", {
                resource: resourceLabel(res),
                amount: Math.floor(source?.orbitalResources[res] ?? 0),
              })}
              min={0}
              max={Math.floor(source?.orbitalResources[res] ?? 0)}
              value={amounts[res] ?? ""}
              placeholder="0"
              onChange={(e) =>
                setAmounts({ ...amounts, [res]: e.target.value })
              }
            />
          ))}

          <span className="small muted">{t("transferPanel.convoyLabel")}</span>
          {SHIP_IDS.map((shipId) => (
            <NumberInput
              key={shipId}
              label={t("transferPanel.shipAvailable", {
                name: shipLabel(shipId).name,
                count: idle[shipId] ?? 0,
              })}
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
              {t("transferPanel.jumps", {
                jumps,
                jumpPlural: jumps > 1 ? "s" : "",
              })}
              {portals > 0
                ? t("transferPanel.portalsSuffix", {
                    portals,
                    portalPlural: portals > 1 ? "s" : "",
                  })
                : ""}
              {t("transferPanel.tripSummary", {
                eta: formatDuration(eta),
                fees,
              })}
              {hasConvoy ? t("transferPanel.fuelSuffix", { fuel }) : ""}
            </span>
          )}
          <span className={`small ${overCapacity ? "ko" : "muted"}`}>
            {hasConvoy
              ? t("transferPanel.holdConvoy", { capacity })
              : t("transferPanel.holdAvailable", { capacity })}
            {overCapacity
              ? t("transferPanel.tooHeavy", { total: totalCargo })
              : ""}
          </span>
          {hasConvoy && missingFuel && (
            <span className="small ko">
              {t("transferPanel.insufficientFuel", {
                fuel,
                available: orbitalEnergy,
              })}
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
            {t("transferPanel.sendConvoy")}
          </Button>
        </div>
      )}
    </Panel>
  );
}
