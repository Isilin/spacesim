import {
  allSystems,
  jumpDistanceInUniverse,
  maxConvoyCapacity,
  transferCostCredits,
  transferDurationMs,
  type ClientMessage,
  type Colony,
  type ResourceId,
  type Route,
  type Transfer,
  type Universe,
} from "@spacesim/shared";
import { useState } from "react";
import { RESOURCE_LABELS } from "./labels.js";

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

function systemIdOf(universe: Universe, planetId: string): string | undefined {
  return allSystems(universe).find((s) => s.planets.some((p) => p.id === planetId))?.id;
}

function formatEta(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

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
  const convoyCapacity = maxConvoyCapacity(colony, routes);
  const overCapacity = totalCargo > convoyCapacity;

  return (
    <section className="transfer-panel">
      <h3>Convois</h3>

      {related.length > 0 && (
        <ul className="queue-list">
          {related.map((t) => {
            const outgoing = t.fromColonyId === colony.id;
            const other = colonies.find(
              (c) => c.id === (outgoing ? t.toColonyId : t.fromColonyId),
            );
            return (
              <li key={t.id} className="queue-item">
                <div className="queue-head">
                  <span>
                    {outgoing ? "→" : "←"} {other?.name ?? "?"}
                  </span>
                  <span className="muted">{formatEta(t.arrivesAt - now)}</span>
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
            <select value={destination?.id ?? ""} onChange={(e) => setDestinationId(e.target.value)}>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {CARGO_RESOURCES.map((res) => (
            <label key={res} className="small muted transfer-amount">
              {RESOURCE_LABELS[res]}
              <input
                type="number"
                min={0}
                max={Math.floor(colony.resources[res])}
                value={amounts[res] ?? ""}
                placeholder="0"
                onChange={(e) => setAmounts({ ...amounts, [res]: e.target.value })}
              />
            </label>
          ))}
          {jumps >= 0 && (
            <span className="small muted">
              {jumps} saut{jumps > 1 ? "s" : ""} —{" "}
              {formatEta(transferDurationMs(jumps) * transferSpeedMult)} —{" "}
              {transferCostCredits(jumps)} crédits
            </span>
          )}
          <span className={`small ${overCapacity ? "ko" : "muted"}`}>
            Soute disponible : {convoyCapacity}
            {overCapacity ? ` — cargaison trop lourde (${totalCargo})` : ""}
          </span>
          <button
            disabled={!hasCargo || !destination || overCapacity || convoyCapacity === 0}
            onClick={() => {
              if (!destination) return;
              send({
                type: "transfer",
                fromColonyId: colony.id,
                toColonyId: destination.id,
                resources: cargo,
              });
              setAmounts({});
            }}
          >
            Envoyer le convoi
          </button>
        </div>
      )}
    </section>
  );
}
