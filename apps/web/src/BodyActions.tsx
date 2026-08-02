import type { ClientMessage } from "@spacesim/protocol";
import {
  canFoundStation,
  COLONY_SHIP_COST,
  colonizeInfluenceCost,
  STATION_SHIP_COST,
  type Colony,
  type EmpireEffects,
  type GameState,
  type Mission,
  type Planet,
  type ResourceId,
  type Station,
} from "@spacesim/shared";
import { Button } from "@spacesim/ui";
import { formatDuration } from "./format.js";
import { RESOURCE_LABELS } from "./labels.js";

interface Props {
  body: Planet;
  colonies: Colony[];
  missions: Mission[];
  /** Colonie d'origine des vaisseaux coloniaux/de construction. */
  activeColony: Colony | null;
  game: GameState;
  effects: EmpireEffects;
  stations: Station[];
  now: number;
  send: (msg: ClientMessage) => void;
}

/** Coût d'un vaisseau colonial, en clair. */
export const COLONY_SHIP_COST_TEXT = Object.entries(COLONY_SHIP_COST)
  .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
  .join(" · ");

/** Coût d'un vaisseau de construction de station, en clair. */
export const STATION_SHIP_COST_TEXT = Object.entries(STATION_SHIP_COST)
  .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
  .join(" · ");

/**
 * Actions possibles sur un corps : colonisation (chantier 10) et fondation d'une
 * station orbitale (chantier 24), indépendantes l'une de l'autre — un corps peut
 * porter les deux à la fois. Extrait du `SystemPanel` pour être partagé avec la vue
 * corps sans duplication.
 */
export function BodyActions({
  body,
  colonies,
  missions,
  activeColony,
  game,
  effects,
  stations,
  now,
  send,
}: Props) {
  return (
    <div className="body-actions">
      <ColonizeAction
        body={body}
        colonies={colonies}
        missions={missions}
        activeColony={activeColony}
        game={game}
        now={now}
        send={send}
      />
      <StationAction
        body={body}
        stations={stations}
        missions={missions}
        activeColony={activeColony}
        effects={effects}
        now={now}
        send={send}
      />
    </div>
  );
}

function ColonizeAction({
  body,
  colonies,
  missions,
  activeColony,
  game,
  now,
  send,
}: Pick<
  Props,
  "body" | "colonies" | "missions" | "activeColony" | "game" | "now" | "send"
>) {
  const colony = colonies.find((c) => c.planetId === body.id);
  const incoming = missions.find(
    (m) => m.kind === "colonize" && m.targetId === body.id,
  );

  if (colony) return <p className="small ok">● {colony.name}</p>;
  if (incoming) {
    return (
      <p className="small ok">
        Vaisseau colonial en route — {formatDuration(incoming.arrivesAt - now)}
      </p>
    );
  }
  if (body.type === "gas") {
    return <p className="small muted">Géante gazeuse — non colonisable.</p>;
  }

  const influenceCost = colonizeInfluenceCost(
    colonies.length + missions.filter((m) => m.kind === "colonize").length,
  );
  const affordable =
    activeColony &&
    (Object.entries(COLONY_SHIP_COST) as [ResourceId, number][]).every(
      ([res, n]) => activeColony.resources[res] >= n,
    );
  const enoughInfluence = game.influence >= influenceCost;

  return (
    <Button
      disabled={!affordable || !enoughInfluence}
      title={
        !activeColony
          ? "Aucune colonie d'origine"
          : !affordable
            ? `Ressources insuffisantes : ${COLONY_SHIP_COST_TEXT}`
            : !enoughInfluence
              ? `Influence insuffisante (${Math.floor(game.influence)}/${influenceCost})`
              : `Coût : ${COLONY_SHIP_COST_TEXT}`
      }
      onClick={() =>
        activeColony &&
        send({ type: "colonize", colonyId: activeColony.id, planetId: body.id })
      }
    >
      Coloniser{influenceCost > 0 ? ` (${influenceCost} ✦)` : ""}
    </Button>
  );
}

function StationAction({
  body,
  stations,
  missions,
  activeColony,
  effects,
  now,
  send,
}: Pick<
  Props,
  "body" | "stations" | "missions" | "activeColony" | "effects" | "now" | "send"
>) {
  const station = stations.find((s) => s.bodyId === body.id);
  const incoming = missions.find(
    (m) => m.kind === "found_station" && m.targetId === body.id,
  );

  if (station) return <p className="small ok">◆ {station.name}</p>;
  if (incoming) {
    return (
      <p className="small ok">
        Vaisseau de construction en route —{" "}
        {formatDuration(incoming.arrivesAt - now)}
      </p>
    );
  }
  if (!canFoundStation(effects)) return null;

  const affordable =
    activeColony &&
    (Object.entries(STATION_SHIP_COST) as [ResourceId, number][]).every(
      ([res, n]) => activeColony.resources[res] >= n,
    );

  return (
    <Button
      disabled={!affordable}
      title={
        !activeColony
          ? "Aucune colonie d'origine"
          : !affordable
            ? `Ressources insuffisantes : ${STATION_SHIP_COST_TEXT}`
            : `Coût : ${STATION_SHIP_COST_TEXT}`
      }
      onClick={() =>
        activeColony &&
        send({
          type: "foundStation",
          colonyId: activeColony.id,
          bodyId: body.id,
        })
      }
    >
      Fonder une station
    </Button>
  );
}
