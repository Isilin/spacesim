import {
  canAfford,
  idleShips,
  MAX_SHIP_QUEUE_LENGTH,
  SHIP_IDS,
  SHIPS,
  type ClientMessage,
  type Colony,
  type ResourceId,
  type Route,
  type TechId,
} from "@spacesim/shared";
import { formatDuration } from "./format.js";
import { RESOURCE_LABELS, SHIP_LABELS, shipLabel, TECH_LABELS } from "./labels.js";

interface Props {
  colony: Colony;
  routes: Route[];
  researched: readonly string[];
  now: number;
  send: (msg: ClientMessage) => void;
}

function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return Object.entries(cost)
    .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
    .join(" · ");
}

export function ShipyardPanel({ colony, routes, researched, now, send }: Props) {
  const hasShipyard = (colony.buildings.shipyard ?? 0) >= 1;
  const idle = idleShips(colony, routes);

  return (
    <section className="shipyard-panel">
      <h3>
        Flotte civile{" "}
        {hasShipyard && (
          <span className="muted small">
            file {colony.shipQueue.length}/{MAX_SHIP_QUEUE_LENGTH}
          </span>
        )}
      </h3>
      {!hasShipyard && (
        <p className="muted small">Construisez un chantier naval pour produire des cargos.</p>
      )}
      <ul className="building-list">
        {SHIP_IDS.map((shipId) => {
          const def = SHIPS[shipId];
          const owned = colony.ships[shipId] ?? 0;
          const queued = colony.shipQueue.filter((q) => q.shipId === shipId).length;
          const techLocked = def.requiresTech && !researched.includes(def.requiresTech);
          const affordable = canAfford(colony, def.cost);
          const queueFull = colony.shipQueue.length >= MAX_SHIP_QUEUE_LENGTH;
          return (
            <li key={shipId} className={`building ${techLocked ? "locked" : ""}`}>
              <div className="building-info">
                <div className="building-head">
                  <strong>{SHIP_LABELS[shipId].name}</strong>
                  <span className="level">
                    ×{owned}
                    {queued > 0 ? ` (+${queued})` : ""}
                  </span>
                  <span className="muted small">{Math.min(idle[shipId] ?? 0, owned)} dispo</span>
                </div>
                <span className="muted small">{SHIP_LABELS[shipId].description}</span>
                {techLocked ? (
                  <span className="muted small">
                    Requiert : {TECH_LABELS[def.requiresTech as TechId].name}
                  </span>
                ) : (
                  <span className="small">
                    {formatCost(def.cost)} — {formatDuration(def.buildMs)}
                  </span>
                )}
              </div>
              {!techLocked && (
                <button
                  disabled={!hasShipyard || !affordable || queueFull}
                  title={
                    !hasShipyard
                      ? "Chantier naval requis"
                      : queueFull
                        ? "File navale pleine"
                        : !affordable
                          ? "Ressources insuffisantes"
                          : ""
                  }
                  onClick={() => send({ type: "buildShip", colonyId: colony.id, shipId })}
                >
                  Produire
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {colony.shipQueue.length > 0 && (
        <ul className="queue-list">
          {colony.shipQueue.map((item) => (
            <li key={`${item.shipId}-${item.startedAt}`} className="queue-item">
              <div className="queue-head">
                <span>{shipLabel(item.shipId).name}</span>
                <span className="muted">{formatDuration(item.finishesAt - now)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
