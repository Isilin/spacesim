import type { ClientMessage } from "@spacesim/protocol";
import {
  allBelts,
  allTradingPosts,
  allSystems,
  fleetCapacity,
  idleShips,
  MARKET_RESOURCES,
  RESOURCES,
  SHIP_IDS,
  type Colony,
  type MiningOutpost,
  type ResourceId,
  type Route,
  type RouteRule,
  type ShipId,
  type Universe,
} from "@spacesim/shared";
import { useState } from "react";
import { Badge, Button, NumberInput, Panel, Select } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format.js";
import { resourceLabel, shipLabel } from "./labels.js";

interface Props {
  routes: Route[];
  colonies: Colony[];
  universe: Universe;
  exploredSystemIds: string[];
  outposts: MiningOutpost[];
  now: number;
  send: (msg: ClientMessage) => void;
}

type RuleType = RouteRule["type"];

const RULE_KEYS: Record<RuleType, string> = {
  maintain: "routesView.ruleMaintain",
  fixed: "routesView.ruleFixed",
  surplus: "routesView.ruleSurplus",
};

export function RoutesView({
  routes,
  colonies,
  universe,
  exploredSystemIds,
  outposts,
  now,
  send,
}: Props) {
  const { t } = useTranslation();
  const [fromId, setFromId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [toId, setToId] = useState("");
  const [resource, setResource] = useState<ResourceId>("ore");
  const [ruleType, setRuleType] = useState<RuleType>("surplus");
  const [param1, setParam1] = useState("");
  const [param2, setParam2] = useState("");
  const [shipCounts, setShipCounts] = useState<Partial<Record<ShipId, string>>>(
    {},
  );

  const belts = allBelts(universe);
  const beltName = (beltId: string) =>
    belts.find((b) => b.id === beltId)?.name ?? t("routesView.unknownBelt");

  const sources = [
    ...colonies.map((c) => ({
      id: c.id,
      kind: "colony" as const,
      label: c.name,
    })),
    ...outposts.map((o) => ({
      id: o.id,
      kind: "outpost" as const,
      label: `⛏ ${beltName(o.beltId)}`,
    })),
  ];
  const source = sources.find((s) => s.id === fromId) ?? sources[0];
  const fromOutpost = source?.kind === "outpost";

  // Propriétaire (fournit les cargos) : la source si c'est une colonie, sinon au choix.
  const owner = fromOutpost
    ? (colonies.find((c) => c.id === ownerId) ?? colonies[0])
    : colonies.find((c) => c.id === source?.id);

  const tradingPosts = allTradingPosts(universe).filter((s) =>
    exploredSystemIds.includes(s.systemId),
  );
  const destinations = [
    ...colonies
      .filter((c) => fromOutpost || c.id !== source?.id)
      .map((c) => ({ id: c.id, kind: "colony" as const, label: c.name })),
    ...tradingPosts.map((s) => ({
      id: s.id,
      kind: "tradingPost" as const,
      label: `⬡ ${s.name}`,
    })),
  ];
  const destination =
    destinations.find((d) => d.id === toId) ?? destinations[0];
  const toTradingPost = destination?.kind === "tradingPost";

  const availableResources = fromOutpost
    ? (["ore"] as const)
    : toTradingPost
      ? MARKET_RESOURCES
      : RESOURCES.filter((r) => r !== "credits" && r !== "science");
  const effectiveResource = (availableResources as readonly string[]).includes(
    resource,
  )
    ? resource
    : (availableResources[0] as ResourceId);

  const idle: Partial<Record<ShipId, number>> = owner
    ? idleShips(owner, routes)
    : {};
  const ships: Partial<Record<ShipId, number>> = {};
  for (const shipId of SHIP_IDS) {
    const n = Math.floor(Number(shipCounts[shipId] ?? ""));
    if (Number.isFinite(n) && n > 0) ships[shipId] = n;
  }
  const capacity = fleetCapacity(ships);

  const p1 = Math.floor(Number(param1));
  const p2 = Math.floor(Number(param2));
  const rule: RouteRule | null =
    ruleType === "maintain"
      ? Number.isFinite(p1) && p1 > 0
        ? {
            type: "maintain",
            minAtDestination: p1,
            keepAtSource: Number.isFinite(p2) && p2 > 0 ? p2 : 0,
          }
        : null
      : ruleType === "fixed"
        ? Number.isFinite(p1) && p1 > 0
          ? { type: "fixed", amount: p1 }
          : null
        : {
            type: "surplus",
            keepAtSource: Number.isFinite(p1) && p1 > 0 ? p1 : 0,
          };

  const canCreate = source && owner && destination && rule && capacity > 0;

  const nameOf = (route: Route): { from: string; to: string } => {
    const from =
      route.fromKind === "colony"
        ? colonies.find((c) => c.id === route.fromId)?.name
        : `⛏ ${beltName(outposts.find((o) => o.id === route.fromId)?.beltId ?? "")}`;
    const to =
      route.toKind === "colony"
        ? colonies.find((c) => c.id === route.toId)?.name
        : allSystems(universe).find((s) => s.station?.id === route.toId)
            ?.station?.name;
    return { from: from ?? "?", to: to ?? "?" };
  };

  return (
    <>
      <Panel title={t("routesView.logisticsRoutes")}>
        {routes.length === 0 ? (
          <p className="muted">{t("routesView.noRoutes")}</p>
        ) : (
          <ul className="route-list">
            {routes.map((route) => {
              const names = nameOf(route);
              const cycle = route.activeCycle;
              const status = route.paused
                ? t("routesView.statusPaused")
                : cycle
                  ? cycle.carrying > 0
                    ? t("routesView.statusEnRoute", {
                        carrying: cycle.carrying,
                        resource: resourceLabel(route.resource),
                        duration: formatDuration(cycle.arrivesAt - now),
                      })
                    : t("routesView.statusReturning", {
                        duration: formatDuration(cycle.backAt - now),
                      })
                  : t("routesView.statusIdle");
              return (
                <li key={route.id} className="route-item">
                  <div className="queue-head">
                    <strong>
                      {names.from} → {names.to}
                    </strong>
                    <Badge variant={route.paused ? "neutral" : "ok"}>
                      {status}
                    </Badge>
                  </div>
                  <span className="small muted">
                    {resourceLabel(route.resource)} ·{" "}
                    {t(RULE_KEYS[route.rule.type])}
                    {route.rule.type === "maintain" &&
                      t("routesView.maintainSuffix", {
                        min: route.rule.minAtDestination,
                        keep: route.rule.keepAtSource,
                      })}
                    {route.rule.type === "fixed" &&
                      t("routesView.fixedSuffix", {
                        amount: route.rule.amount,
                      })}
                    {route.rule.type === "surplus" &&
                      t("routesView.surplusSuffix", {
                        keep: route.rule.keepAtSource,
                      })}
                    {t("routesView.holdSuffix", {
                      capacity: fleetCapacity(route.ships),
                    })}
                  </span>
                  <div className="route-actions">
                    <Button
                      onClick={() =>
                        send({
                          type: "setRoutePaused",
                          routeId: route.id,
                          paused: !route.paused,
                        })
                      }
                    >
                      {route.paused
                        ? t("routesView.resume")
                        : t("routesView.suspend")}
                    </Button>
                    <Button
                      disabled={!!route.activeCycle}
                      title={
                        route.activeCycle ? t("routesView.waitForCycle") : ""
                      }
                      onClick={() =>
                        send({ type: "deleteRoute", routeId: route.id })
                      }
                    >
                      {t("routesView.remove")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title={t("routesView.newRoute")}>
        <div className="form-stack">
          <Select
            label={t("routesView.source")}
            value={source?.id ?? ""}
            onChange={(e) => setFromId(e.target.value)}
            options={sources.map((s) => ({ value: s.id, label: s.label }))}
          />
          {fromOutpost && (
            <Select
              label={t("routesView.cargoProvidedBy")}
              value={owner?.id ?? ""}
              onChange={(e) => setOwnerId(e.target.value)}
              options={colonies.map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
          <Select
            label={t("transferPanel.destination")}
            value={destination?.id ?? ""}
            onChange={(e) => setToId(e.target.value)}
            options={destinations.map((d) => ({ value: d.id, label: d.label }))}
          />
          <Select
            label={t("routesView.resource")}
            value={effectiveResource}
            onChange={(e) => setResource(e.target.value as ResourceId)}
            options={availableResources.map((res) => ({
              value: res,
              label: resourceLabel(res as ResourceId),
            }))}
          />
          <Select
            label={t("routesView.rule")}
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as RuleType)}
            options={(Object.keys(RULE_KEYS) as RuleType[])
              .filter((r) => !(toTradingPost && r === "maintain"))
              .map((r) => ({ value: r, label: t(RULE_KEYS[r]) }))}
          />
          {ruleType === "maintain" && (
            <>
              <NumberInput
                label={t("routesView.minStockDestination")}
                min={1}
                value={param1}
                onChange={(e) => setParam1(e.target.value)}
              />
              <NumberInput
                label={t("routesView.keepAtSource")}
                min={0}
                value={param2}
                onChange={(e) => setParam2(e.target.value)}
              />
            </>
          )}
          {ruleType === "fixed" && (
            <NumberInput
              label={t("routesView.quantityPerCycle")}
              min={1}
              value={param1}
              onChange={(e) => setParam1(e.target.value)}
            />
          )}
          {ruleType === "surplus" && (
            <NumberInput
              label={t("routesView.keepAtSource")}
              min={0}
              value={param1}
              placeholder="0"
              onChange={(e) => setParam1(e.target.value)}
            />
          )}
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
          {capacity > 0 && (
            <span className="small ok">
              {t("routesView.totalHold", { capacity })}
            </span>
          )}
          <Button
            disabled={!canCreate}
            onClick={() => {
              if (!source || !owner || !destination || !rule) return;
              send({
                type: "createRoute",
                ownerColonyId: owner.id,
                fromId: source.id,
                fromKind: source.kind,
                toId: destination.id,
                toKind: destination.kind,
                resource: effectiveResource,
                rule,
                ships,
              });
              setShipCounts({});
              setParam1("");
              setParam2("");
            }}
          >
            {t("routesView.createRoute")}
          </Button>
        </div>
      </Panel>
    </>
  );
}
