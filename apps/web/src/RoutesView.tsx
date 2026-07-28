import type { ClientMessage } from "@spacesim/protocol";
import {
  allBelts,
  allStations,
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
import { formatDuration } from "./format.js";
import { RESOURCE_LABELS, SHIP_LABELS } from "./labels.js";

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

const RULE_LABELS: Record<RuleType, string> = {
  maintain: "Maintenir un stock à destination",
  fixed: "Quantité fixe par cycle",
  surplus: "Exporter le surplus",
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
  const [fromId, setFromId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [toId, setToId] = useState("");
  const [resource, setResource] = useState<ResourceId>("ore");
  const [ruleType, setRuleType] = useState<RuleType>("surplus");
  const [param1, setParam1] = useState("");
  const [param2, setParam2] = useState("");
  const [shipCounts, setShipCounts] = useState<Partial<Record<ShipId, string>>>({});

  const belts = allBelts(universe);
  const beltName = (beltId: string) => belts.find((b) => b.id === beltId)?.name ?? "Ceinture ?";

  const sources = [
    ...colonies.map((c) => ({ id: c.id, kind: "colony" as const, label: c.name })),
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

  const stations = allStations(universe).filter((s) => exploredSystemIds.includes(s.systemId));
  const destinations = [
    ...colonies
      .filter((c) => fromOutpost || c.id !== source?.id)
      .map((c) => ({ id: c.id, kind: "colony" as const, label: c.name })),
    ...stations.map((s) => ({ id: s.id, kind: "station" as const, label: `⬡ ${s.name}` })),
  ];
  const destination = destinations.find((d) => d.id === toId) ?? destinations[0];
  const toStation = destination?.kind === "station";

  const availableResources = fromOutpost
    ? (["ore"] as const)
    : toStation
      ? MARKET_RESOURCES
      : RESOURCES.filter((r) => r !== "credits" && r !== "science");
  const effectiveResource = (availableResources as readonly string[]).includes(resource)
    ? resource
    : (availableResources[0] as ResourceId);

  const idle: Partial<Record<ShipId, number>> = owner ? idleShips(owner, routes) : {};
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
        : { type: "surplus", keepAtSource: Number.isFinite(p1) && p1 > 0 ? p1 : 0 };

  const canCreate = source && owner && destination && rule && capacity > 0;

  const nameOf = (route: Route): { from: string; to: string } => {
    const from =
      route.fromKind === "colony"
        ? colonies.find((c) => c.id === route.fromId)?.name
        : `⛏ ${beltName(outposts.find((o) => o.id === route.fromId)?.beltId ?? "")}`;
    const to =
      route.toKind === "colony"
        ? colonies.find((c) => c.id === route.toId)?.name
        : allSystems(universe).find((s) => s.station?.id === route.toId)?.station?.name;
    return { from: from ?? "?", to: to ?? "?" };
  };

  return (
    <>
      <Panel title="Routes logistiques">
        {routes.length === 0 ? (
          <p className="muted">Aucune route. La flotte attend vos ordres.</p>
        ) : (
          <ul className="route-list">
            {routes.map((route) => {
              const names = nameOf(route);
              const cycle = route.activeCycle;
              const status = route.paused
                ? "en pause"
                : cycle
                  ? cycle.carrying > 0
                    ? `en route (${cycle.carrying} ${RESOURCE_LABELS[route.resource]}) — livraison ${formatDuration(cycle.arrivesAt - now)}`
                    : `retour — ${formatDuration(cycle.backAt - now)}`
                  : "au repos (règle non déclenchée)";
              return (
                <li key={route.id} className="route-item">
                  <div className="queue-head">
                    <strong>
                      {names.from} → {names.to}
                    </strong>
                    <Badge variant={route.paused ? "neutral" : "ok"}>{status}</Badge>
                  </div>
                  <span className="small muted">
                    {RESOURCE_LABELS[route.resource]} · {RULE_LABELS[route.rule.type]}
                    {route.rule.type === "maintain" &&
                      ` (≥ ${route.rule.minAtDestination} dest., garde ${route.rule.keepAtSource})`}
                    {route.rule.type === "fixed" && ` (${route.rule.amount}/cycle)`}
                    {route.rule.type === "surplus" && ` (garde ${route.rule.keepAtSource})`}
                    {" · soute "}
                    {fleetCapacity(route.ships)}
                  </span>
                  <div className="route-actions">
                    <Button
                      onClick={() =>
                        send({ type: "setRoutePaused", routeId: route.id, paused: !route.paused })
                      }
                    >
                      {route.paused ? "Reprendre" : "Suspendre"}
                    </Button>
                    <Button
                      disabled={!!route.activeCycle}
                      title={route.activeCycle ? "Attendez le retour du cycle en cours" : ""}
                      onClick={() => send({ type: "deleteRoute", routeId: route.id })}
                    >
                      Supprimer
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Nouvelle route">
        <div className="form-stack">
          <Select
            label="Source"
            value={source?.id ?? ""}
            onChange={(e) => setFromId(e.target.value)}
            options={sources.map((s) => ({ value: s.id, label: s.label }))}
          />
          {fromOutpost && (
            <Select
              label="Cargos fournis par"
              value={owner?.id ?? ""}
              onChange={(e) => setOwnerId(e.target.value)}
              options={colonies.map((c) => ({ value: c.id, label: c.name }))}
            />
          )}
          <Select
            label="Destination"
            value={destination?.id ?? ""}
            onChange={(e) => setToId(e.target.value)}
            options={destinations.map((d) => ({ value: d.id, label: d.label }))}
          />
          <Select
            label="Ressource"
            value={effectiveResource}
            onChange={(e) => setResource(e.target.value as ResourceId)}
            options={availableResources.map((res) => ({
              value: res,
              label: RESOURCE_LABELS[res as ResourceId],
            }))}
          />
          <Select
            label="Règle"
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as RuleType)}
            options={(Object.keys(RULE_LABELS) as RuleType[])
              .filter((r) => !(toStation && r === "maintain"))
              .map((r) => ({ value: r, label: RULE_LABELS[r] }))}
          />
          {ruleType === "maintain" && (
            <>
              <NumberInput
                label="Stock min à destination"
                min={1}
                value={param1}
                onChange={(e) => setParam1(e.target.value)}
              />
              <NumberInput
                label="Garder à la source"
                min={0}
                value={param2}
                onChange={(e) => setParam2(e.target.value)}
              />
            </>
          )}
          {ruleType === "fixed" && (
            <NumberInput
              label="Quantité par cycle"
              min={1}
              value={param1}
              onChange={(e) => setParam1(e.target.value)}
            />
          )}
          {ruleType === "surplus" && (
            <NumberInput
              label="Garder à la source"
              min={0}
              value={param1}
              placeholder="0"
              onChange={(e) => setParam1(e.target.value)}
            />
          )}
          {SHIP_IDS.map((shipId) => (
            <NumberInput
              key={shipId}
              label={`${SHIP_LABELS[shipId].name} (dispo : ${idle[shipId] ?? 0})`}
              min={0}
              max={idle[shipId] ?? 0}
              value={shipCounts[shipId] ?? ""}
              placeholder="0"
              onChange={(e) => setShipCounts({ ...shipCounts, [shipId]: e.target.value })}
            />
          ))}
          {capacity > 0 && <span className="small ok">Soute totale : {capacity}</span>}
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
            Créer la route
          </Button>
        </div>
      </Panel>
    </>
  );
}
