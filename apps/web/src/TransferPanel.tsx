import type { ClientMessage } from "@spacesim/protocol";
import {
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  hostileSystemIds,
  idleShips,
  maxConvoyCapacity,
  routeCandidates,
  universeGraph,
  SHIP_IDS,
  type Colony,
  type ResourceId,
  type Relation,
  type Route,
  type ShipId,
  type Territory,
  type Transfer,
  type TravelRoute,
  type ClientUniverse,
} from "@spacesim/shared";
import { useState } from "react";
import { Button, NumberInput, Panel, Select } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { formatDuration, systemIdOf } from "./format.js";
import { resourceLabel, shipLabel } from "./labels.js";

interface Props {
  colony: Colony;
  colonies: Colony[];
  transfers: Transfer[];
  universe: ClientUniverse;
  /** Multiplicateur de vitesse des convois (tech logistique). */
  transferSpeedMult: number;
  routes: Route[];
  /** Liaisons des portails actifs (distances inter-galactiques). */
  portalLinks: [string, string][];
  /** Systèmes revendiqués visibles — sert à repérer l'espace hostile (chantier 31.10). */
  territories: Territory[];
  /** Relations de l'empire — seule la guerre rend un territoire évitable. */
  relations: Relation[];
  /** Empire du joueur, pour savoir avec qui il est en guerre. */
  empireId: string;
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

export function TransferPanel({
  colony,
  colonies,
  transfers,
  universe,
  transferSpeedMult,
  routes,
  portalLinks,
  territories,
  relations,
  empireId,
  now,
  send,
}: Props) {
  const { t } = useTranslation();
  const others = colonies.filter((c) => c.id !== colony.id);
  const [destinationId, setDestinationId] = useState("");
  const [amounts, setAmounts] = useState<Partial<Record<ResourceId, string>>>(
    {},
  );
  const [shipCounts, setShipCounts] = useState<Partial<Record<ShipId, string>>>(
    {},
  );
  const [routeKind, setRouteKind] = useState("");

  const related = transfers.filter(
    (t) => t.fromColonyId === colony.id || t.toId === colony.id,
  );

  // Fallback sur la première autre colonie : le state peut précéder sa fondation.
  const destination = others.find((c) => c.id === destinationId) ?? others[0];
  const fromSystem = systemIdOf(universe, colony.planetId);
  const toSystem = destination
    ? systemIdOf(universe, destination.planetId)
    : undefined;
  /**
   * Itinéraires proposés (chantier 31.10). Calculés ici plutôt que demandés au serveur :
   * le client dispose déjà de l'univers et des mêmes fonctions de coût, et le serveur
   * revalide de toute façon le chemin reçu — il n'y a donc rien à gagner à un
   * aller-retour réseau. Une seule option = pas de choix affiché, pas de faux choix.
   */
  const candidates: TravelRoute[] =
    fromSystem && toSystem
      ? routeCandidates(
          universeGraph(universe, portalLinks),
          fromSystem,
          toSystem,
          hostileSystemIds(territories, relations, empireId),
        )
      : [];
  const chosen = candidates.find((c) => c.kind === routeKind) ?? candidates[0];
  const jumps = chosen ? chosen.cost : -1;

  const cargo: Partial<Record<ResourceId, number>> = {};
  for (const res of CARGO_RESOURCES) {
    const n = Math.floor(Number(amounts[res] ?? ""));
    if (Number.isFinite(n) && n > 0) cargo[res] = n;
  }
  const hasCargo = Object.keys(cargo).length > 0;
  const totalCargo = Object.values(cargo).reduce((s, n) => s + n, 0);

  // Convoi choisi (chantier 12) : chaque classe arbitre volume, vitesse et carburant.
  const idle: Partial<Record<ShipId, number>> = idleShips(colony, routes);
  const convoy: Partial<Record<ShipId, number>> = {};
  for (const shipId of SHIP_IDS) {
    const n = Math.floor(Number(shipCounts[shipId] ?? ""));
    if (Number.isFinite(n) && n > 0) convoy[shipId] = n;
  }
  const hasConvoy = Object.keys(convoy).length > 0;
  const capacity = hasConvoy
    ? convoyCapacity(convoy)
    : maxConvoyCapacity(colony, routes);
  const overCapacity = totalCargo > capacity;

  // Devis du voyage : durée du plus lent, carburant pris en orbite, frais et péages.
  // Portails réellement empruntés par l'itinéraire retenu, et non plus déduits des
  // galaxies d'extrémité : deux itinéraires vers la même destination peuvent en
  // traverser un nombre différent, c'est tout l'intérêt du choix.
  const portals = chosen ? chosen.gates : 0;
  const eta =
    jumps >= 0 ? convoyDurationMs(jumps, convoy) * transferSpeedMult : 0;
  const fuel =
    jumps >= 0 && hasConvoy ? convoyFuel(jumps, convoy, totalCargo) : 0;
  const fees = jumps >= 0 ? convoyFees(jumps, portals) : 0;
  const orbitalEnergy = Math.floor(colony.orbitalResources.energy ?? 0);
  const missingFuel = fuel > orbitalEnergy;

  return (
    <Panel title={t("transferPanel.title")}>
      {related.length > 0 && (
        <ul className="queue-list">
          {related.map((t) => {
            const outgoing = t.fromColonyId === colony.id;
            const other = colonies.find(
              (c) => c.id === (outgoing ? t.toId : t.fromColonyId),
            );
            return (
              <li key={t.id} className="queue-item">
                <div className="queue-head">
                  <span>
                    {outgoing ? "→" : "←"} {other?.name ?? "?"}
                  </span>
                  <span className="muted">
                    {formatDuration(t.arrivesAt - now)}
                  </span>
                </div>
                <span className="small muted">
                  {Object.entries(t.resources)
                    .map(
                      ([res, n]) => `${n} ${resourceLabel(res as ResourceId)}`,
                    )
                    .join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {others.length === 0 ? (
        <p className="muted small">{t("transferPanel.noSecondColony")}</p>
      ) : (
        <div className="form-stack">
          <Select
            label={t("transferPanel.destination")}
            value={destination?.id ?? ""}
            onChange={(e) => setDestinationId(e.target.value)}
            options={others.map((c) => ({ value: c.id, label: c.name }))}
          />
          {/* Un seul itinéraire possible : pas de sélecteur, ce serait un faux choix. */}
          {candidates.length > 1 && (
            <Select
              label={t("transferPanel.route")}
              value={chosen?.kind ?? ""}
              onChange={(e) => setRouteKind(e.target.value)}
              options={candidates.map((c) => ({
                value: c.kind,
                label: t("transferPanel.routeOption", {
                  kind: t(`transferPanel.routeKind.${c.kind}`),
                  jumps: c.cost.toFixed(1),
                  gates: c.gates,
                }),
              }))}
            />
          )}
          {/* La cargaison part de l'orbite : c'est ce stock-là qui borne la saisie. */}
          {CARGO_RESOURCES.map((res) => (
            <NumberInput
              key={res}
              label={t("transferPanel.resourceOrbit", {
                resource: resourceLabel(res),
                amount: Math.floor(colony.orbitalResources[res] ?? 0),
              })}
              min={0}
              max={Math.floor(colony.orbitalResources[res] ?? 0)}
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
              !destination ||
              overCapacity ||
              capacity === 0 ||
              (hasConvoy && missingFuel)
            }
            onClick={() => {
              if (!destination) return;
              send({
                type: "transfer",
                fromColonyId: colony.id,
                toId: destination.id,
                resources: cargo,
                ...(hasConvoy ? { ships: convoy } : {}),
                ...(chosen ? { route: chosen.path } : {}),
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
