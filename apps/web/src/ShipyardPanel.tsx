import type { ClientMessage } from "@spacesim/protocol";
import {
  canAfford,
  idleShips,
  MAX_SHIP_QUEUE_LENGTH,
  SHIP_IDS,
  SHIPS,
  type Colony,
  type ResourceId,
  type Route,
  type TechId,
} from "@spacesim/shared";
import { Badge, Button, EmptyState, ListRow, Panel, RowHeader } from "@spacesim/ui";
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
    <Panel
      title={
        hasShipyard
          ? `Flotte civile — file ${colony.shipQueue.length}/${MAX_SHIP_QUEUE_LENGTH}`
          : "Flotte civile"
      }
    >
      {!hasShipyard && (
        <EmptyState>Construisez un chantier naval pour produire des cargos.</EmptyState>
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
            <ListRow
              key={shipId}
              title={SHIP_LABELS[shipId].name}
              level={`×${owned}${queued > 0 ? ` (+${queued})` : ""}`}
              meta={
                techLocked
                  ? `${SHIP_LABELS[shipId].description} · Requiert : ${TECH_LABELS[def.requiresTech as TechId].name}`
                  : `${SHIP_LABELS[shipId].description} · ${formatCost(def.cost)} — ${formatDuration(def.buildMs)}`
              }
              right={
                <>
                  <Badge>{Math.min(idle[shipId] ?? 0, owned)} dispo</Badge>
                  {!techLocked && (
                    <Button
                      size="sm"
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
                    </Button>
                  )}
                </>
              }
            />
          );
        })}
      </ul>
      {colony.shipQueue.length > 0 && (
        <ul className="queue-list">
          {colony.shipQueue.map((item) => (
            <li key={`${item.shipId}-${item.startedAt}`} className="queue-item">
              <RowHeader
                label={shipLabel(item.shipId).name}
                value={formatDuration(item.finishesAt - now)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
