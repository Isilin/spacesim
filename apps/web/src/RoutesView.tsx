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
    <div className="routes-view">
      <h3>Routes logistiques</h3>
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
                  <span className={route.paused ? "muted" : "ok"}>{status}</span>
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
                  <button
                    className="action-button"
                    onClick={() =>
                      send({ type: "setRoutePaused", routeId: route.id, paused: !route.paused })
                    }
                  >
                    {route.paused ? "Reprendre" : "Suspendre"}
                  </button>
                  <button
                    className="action-button"
                    disabled={!!route.activeCycle}
                    title={route.activeCycle ? "Attendez le retour du cycle en cours" : ""}
                    onClick={() => send({ type: "deleteRoute", routeId: route.id })}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="routes-create-title">Nouvelle route</h3>
      <div className="transfer-form">
        <label className="small muted">
          Source{" "}
          <select value={source?.id ?? ""} onChange={(e) => setFromId(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {fromOutpost && (
          <label className="small muted">
            Cargos fournis par{" "}
            <select value={owner?.id ?? ""} onChange={(e) => setOwnerId(e.target.value)}>
              {colonies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="small muted">
          Destination{" "}
          <select value={destination?.id ?? ""} onChange={(e) => setToId(e.target.value)}>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="small muted">
          Ressource{" "}
          <select
            value={effectiveResource}
            onChange={(e) => setResource(e.target.value as ResourceId)}
          >
            {availableResources.map((res) => (
              <option key={res} value={res}>
                {RESOURCE_LABELS[res as ResourceId]}
              </option>
            ))}
          </select>
        </label>
        <label className="small muted">
          Règle{" "}
          <select value={ruleType} onChange={(e) => setRuleType(e.target.value as RuleType)}>
            {(Object.keys(RULE_LABELS) as RuleType[])
              .filter((r) => !(toStation && r === "maintain"))
              .map((r) => (
                <option key={r} value={r}>
                  {RULE_LABELS[r]}
                </option>
              ))}
          </select>
        </label>
        {ruleType === "maintain" && (
          <>
            <label className="small muted transfer-amount">
              Stock min à destination
              <input
                type="number"
                min={1}
                value={param1}
                onChange={(e) => setParam1(e.target.value)}
              />
            </label>
            <label className="small muted transfer-amount">
              Garder à la source
              <input
                type="number"
                min={0}
                value={param2}
                onChange={(e) => setParam2(e.target.value)}
              />
            </label>
          </>
        )}
        {ruleType === "fixed" && (
          <label className="small muted transfer-amount">
            Quantité par cycle
            <input
              type="number"
              min={1}
              value={param1}
              onChange={(e) => setParam1(e.target.value)}
            />
          </label>
        )}
        {ruleType === "surplus" && (
          <label className="small muted transfer-amount">
            Garder à la source
            <input
              type="number"
              min={0}
              value={param1}
              placeholder="0"
              onChange={(e) => setParam1(e.target.value)}
            />
          </label>
        )}
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
        {capacity > 0 && <span className="small ok">Soute totale : {capacity}</span>}
        <button
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
        </button>
      </div>
    </div>
  );
}
