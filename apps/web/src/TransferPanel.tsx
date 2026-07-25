import {
  convoyCapacity,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  findGalaxyOfSystem,
  idleShips,
  jumpDistanceInUniverse,
  maxConvoyCapacity,
  SHIP_IDS,
  type ClientMessage,
  type Colony,
  type ResourceId,
  type Route,
  type ShipId,
  type Transfer,
  type Universe,
} from "@spacesim/shared";
import { useState } from "react";
import { formatDuration, systemIdOf } from "./format.js";
import { RESOURCE_LABELS, SHIP_LABELS } from "./labels.js";

interface Props {
  colony: Colony;
  colonies: Colony[];
  transfers: Transfer[];
  universe: Universe;
  /** Multiplicateur de vitesse des convois (tech logistique). */
  transferSpeedMult: number;
  routes: Route[];
  /** Liaisons des portails actifs (distances inter-galactiques). */
  portalLinks: [string, string][];
  now: number;
  send: (msg: ClientMessage) => void;
}

const CARGO_RESOURCES: ResourceId[] = ["ore", "metals", "components", "food", "goods"];

export function TransferPanel({
  colony,
  colonies,
  transfers,
  universe,
  transferSpeedMult,
  routes,
  portalLinks,
  now,
  send,
}: Props) {
  const others = colonies.filter((c) => c.id !== colony.id);
  const [destinationId, setDestinationId] = useState("");
  const [amounts, setAmounts] = useState<Partial<Record<ResourceId, string>>>({});
  const [shipCounts, setShipCounts] = useState<Partial<Record<ShipId, string>>>({});

  /**
   * Portails empruntés : tous partent de l'ancrage de la galaxie d'origine, donc
   * rejoindre une galaxie lointaine en traverse un, en relier deux en traverse deux.
   */
  const portalsBetween = (fromSystemId: string, toSystemId: string): number => {
    const a = findGalaxyOfSystem(universe, fromSystemId)?.id;
    const b = findGalaxyOfSystem(universe, toSystemId)?.id;
    if (!a || !b || a === b) return 0;
    return a === "gal-0" || b === "gal-0" ? 1 : 2;
  };

  const related = transfers.filter(
    (t) => t.fromColonyId === colony.id || t.toColonyId === colony.id,
  );

  // Fallback sur la première autre colonie : le state peut précéder sa fondation.
  const destination = others.find((c) => c.id === destinationId) ?? others[0];
  const fromSystem = systemIdOf(universe, colony.planetId);
  const toSystem = destination ? systemIdOf(universe, destination.planetId) : undefined;
  const jumps =
    fromSystem && toSystem
      ? jumpDistanceInUniverse(universe, fromSystem, toSystem, portalLinks)
      : -1;

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
  const capacity = hasConvoy ? convoyCapacity(convoy) : maxConvoyCapacity(colony, routes);
  const overCapacity = totalCargo > capacity;

  // Devis du voyage : durée du plus lent, carburant pris en orbite, frais et péages.
  const portals = jumps > 0 && fromSystem && toSystem ? portalsBetween(fromSystem, toSystem) : 0;
  const eta = jumps >= 0 ? convoyDurationMs(jumps, convoy) * transferSpeedMult : 0;
  const fuel = jumps >= 0 && hasConvoy ? convoyFuel(jumps, convoy, totalCargo) : 0;
  const fees = jumps >= 0 ? convoyFees(jumps, portals) : 0;
  const orbitalEnergy = Math.floor(colony.orbitalResources.energy ?? 0);
  const missingFuel = fuel > orbitalEnergy;

  return (
    <section className="transfer-panel">
      <h3>Convois</h3>

      {related.length > 0 && (
        <ul className="queue-list">
          {related.map((t) => {
            const outgoing = t.fromColonyId === colony.id;
            const other = colonies.find((c) => c.id === (outgoing ? t.toColonyId : t.fromColonyId));
            return (
              <li key={t.id} className="queue-item">
                <div className="queue-head">
                  <span>
                    {outgoing ? "→" : "←"} {other?.name ?? "?"}
                  </span>
                  <span className="muted">{formatDuration(t.arrivesAt - now)}</span>
                </div>
                <span className="small muted">
                  {Object.entries(t.resources)
                    .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
                    .join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {others.length === 0 ? (
        <p className="muted small">Fondez une seconde colonie pour envoyer des convois.</p>
      ) : (
        <div className="transfer-form">
          <label className="small muted">
            Destination{" "}
            <select
              value={destination?.id ?? ""}
              onChange={(e) => setDestinationId(e.target.value)}
            >
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {/* La cargaison part de l'orbite : c'est ce stock-là qui borne la saisie. */}
          {CARGO_RESOURCES.map((res) => (
            <label key={res} className="small muted transfer-amount">
              {RESOURCE_LABELS[res]} (orbite : {Math.floor(colony.orbitalResources[res] ?? 0)})
              <input
                type="number"
                min={0}
                max={Math.floor(colony.orbitalResources[res] ?? 0)}
                value={amounts[res] ?? ""}
                placeholder="0"
                onChange={(e) => setAmounts({ ...amounts, [res]: e.target.value })}
              />
            </label>
          ))}

          <span className="small muted">Convoi</span>
          {SHIP_IDS.map((shipId) => (
            <label key={shipId} className="small muted transfer-amount">
              {SHIP_LABELS[shipId].name} (dispo : {idle[shipId] ?? 0})
              <input
                type="number"
                min={0}
                max={idle[shipId] ?? 0}
                value={shipCounts[shipId] ?? ""}
                placeholder="0"
                onChange={(e) => setShipCounts({ ...shipCounts, [shipId]: e.target.value })}
              />
            </label>
          ))}

          {jumps >= 0 && (
            <span className="small muted">
              {jumps} saut{jumps > 1 ? "s" : ""}
              {portals > 0 ? ` · ${portals} portail${portals > 1 ? "s" : ""}` : ""} —{" "}
              {formatDuration(eta)} — {fees} crédits
              {hasConvoy ? ` · ${fuel} énergie` : ""}
            </span>
          )}
          <span className={`small ${overCapacity ? "ko" : "muted"}`}>
            Soute {hasConvoy ? "du convoi" : "disponible"} : {capacity}
            {overCapacity ? ` — cargaison trop lourde (${totalCargo})` : ""}
          </span>
          {hasConvoy && missingFuel && (
            <span className="small ko">
              Carburant insuffisant en orbite : {fuel} requis, {orbitalEnergy} disponible.
            </span>
          )}
          <button
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
                toColonyId: destination.id,
                resources: cargo,
                ...(hasConvoy ? { ships: convoy } : {}),
              });
              setAmounts({});
              setShipCounts({});
            }}
          >
            Envoyer le convoi
          </button>
        </div>
      )}
    </section>
  );
}
