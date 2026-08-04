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
import {
  Badge,
  Button,
  EmptyState,
  ListRow,
  Panel,
  RowHeader,
} from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format.js";
import { resourceLabel, shipLabel, techLabel } from "./labels.js";

interface Props {
  colony: Colony;
  routes: Route[];
  researched: readonly string[];
  now: number;
  send: (msg: ClientMessage) => void;
}

function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return Object.entries(cost)
    .map(([res, n]) => `${n} ${resourceLabel(res as ResourceId)}`)
    .join(" · ");
}

export function ShipyardPanel({
  colony,
  routes,
  researched,
  now,
  send,
}: Props) {
  const { t } = useTranslation();
  const hasShipyard = (colony.buildings.shipyard ?? 0) >= 1;
  const idle = idleShips(colony, routes);

  return (
    <Panel
      title={
        hasShipyard
          ? t("shipyardPanel.titleWithQueue", {
              count: colony.shipQueue.length,
              max: MAX_SHIP_QUEUE_LENGTH,
            })
          : t("shipyardPanel.title")
      }
    >
      {!hasShipyard && (
        <EmptyState>{t("shipyardPanel.needShipyard")}</EmptyState>
      )}
      <ul className="building-list">
        {SHIP_IDS.map((shipId) => {
          const def = SHIPS[shipId];
          const owned = colony.ships[shipId] ?? 0;
          const queued = colony.shipQueue.filter(
            (q) => q.shipId === shipId,
          ).length;
          const techLocked =
            def.requiresTech && !researched.includes(def.requiresTech);
          const affordable = canAfford(colony, def.cost);
          const queueFull = colony.shipQueue.length >= MAX_SHIP_QUEUE_LENGTH;
          return (
            <ListRow
              key={shipId}
              title={shipLabel(shipId).name}
              level={`×${owned}${queued > 0 ? ` (+${queued})` : ""}`}
              meta={
                techLocked
                  ? `${shipLabel(shipId).description}${t("shipyardPanel.requires", { tech: techLabel(def.requiresTech as TechId).name })}`
                  : `${shipLabel(shipId).description} · ${formatCost(def.cost)} — ${formatDuration(def.buildMs)}`
              }
              right={
                <>
                  <Badge>
                    {t("shipyardPanel.available", {
                      count: Math.min(idle[shipId] ?? 0, owned),
                    })}
                  </Badge>
                  {!techLocked && (
                    <Button
                      size="sm"
                      disabled={!hasShipyard || !affordable || queueFull}
                      title={
                        !hasShipyard
                          ? t("shipyardPanel.needShipyardTooltip")
                          : queueFull
                            ? t("shipyardPanel.queueFull")
                            : !affordable
                              ? t("shipyardPanel.notAffordable")
                              : ""
                      }
                      onClick={() =>
                        send({ type: "buildShip", colonyId: colony.id, shipId })
                      }
                    >
                      {t("shipyardPanel.produce")}
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
