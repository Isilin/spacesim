import type { ClientMessage } from "@spacesim/protocol";
import {
  COLONY_SHIP_COST,
  colonizeInfluenceCost,
  type Colony,
  type GameState,
  type Mission,
  type Planet,
  type ResourceId,
} from "@spacesim/shared";
import { formatDuration } from "./format.js";
import { RESOURCE_LABELS } from "./labels.js";

interface Props {
  body: Planet;
  colonies: Colony[];
  missions: Mission[];
  /** Colonie d'origine des vaisseaux coloniaux. */
  activeColony: Colony | null;
  game: GameState;
  now: number;
  send: (msg: ClientMessage) => void;
}

/** Coût d'un vaisseau colonial, en clair. */
export const COLONY_SHIP_COST_TEXT = Object.entries(COLONY_SHIP_COST)
  .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
  .join(" · ");

/**
 * Actions possibles sur un corps (chantier 10) : colonisation, ou état en cours.
 * Extrait du `SystemPanel` pour être partagé avec la vue corps sans duplication.
 */
export function BodyActions({ body, colonies, missions, activeColony, game, now, send }: Props) {
  const colony = colonies.find((c) => c.planetId === body.id);
  const incoming = missions.find((m) => m.kind === "colonize" && m.targetId === body.id);

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
    <button
      className="action-button"
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
        activeColony && send({ type: "colonize", colonyId: activeColony.id, planetId: body.id })
      }
    >
      Coloniser{influenceCost > 0 ? ` (${influenceCost} ✦)` : ""}
    </button>
  );
}
