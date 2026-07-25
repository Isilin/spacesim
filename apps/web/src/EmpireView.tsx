import {
  allSystems,
  FACTION_IDS,
  FACTIONS,
  influencePerTick,
  MILESTONES,
  REP_TIERS,
  type ClientMessage,
  type Colony,
  type Contract,
  type EmpireEffects,
  type FactionId,
  type FactionState,
  type GameState,
  type LeaderboardEntry,
  type MilestoneMetric,
  type Objective,
  type PirateLair,
  type RelationProposal,
  type Universe,
  type WorldEvent,
} from "@spacesim/shared";
import { formatDuration } from "./format.js";
import {
  FACTION_MOOD_LABELS,
  OBJECTIVE_KIND_LABELS,
  RELATION_BADGES,
  RESOURCE_LABELS,
  WORLD_EVENT_LABELS,
  repTierName,
} from "./labels.js";

interface Props {
  game: GameState;
  colonies: Colony[];
  universe: Universe;
  exploredSystemIds: string[];
  leaderboard: LeaderboardEntry[];
  factionStates: FactionState[];
  contracts: Contract[];
  proposals: RelationProposal[];
  objectives: Objective[];
  worldEvents: WorldEvent[];
  pirateLairs: PirateLair[];
  playerId: string | null;
  effects: EmpireEffects;
  now: number;
  send: (msg: ClientMessage) => void;
}

/** Détail affiché sous le libellé d'un objectif (chantier 17.4). */
function objectiveDetail(o: Objective, universe: Universe, colonyCount: number): string {
  switch (o.kind) {
    case "colonize_n_systems":
      return `${colonyCount}/${o.targetCount ?? "?"} colonies`;
    case "hold_system": {
      const name =
        allSystems(universe).find((s) => s.id === o.targetSystemId)?.name ?? o.targetSystemId;
      return `Conserver la revendication sur ${name}`;
    }
    case "lead_population":
      return "Avoir la plus grande population de la partie";
    case "lead_influence":
      return "Avoir la plus grande influence de la partie";
    default:
      return "";
  }
}

/** Lieu touché par un événement de monde (galaxie ou faction, selon le genre). */
function worldEventLocation(e: WorldEvent, universe: Universe): string {
  if (e.galaxyId) return universe.galaxies.find((g) => g.id === e.galaxyId)?.name ?? e.galaxyId;
  if (e.factionId) return FACTIONS[e.factionId as FactionId]?.name ?? e.factionId;
  return "";
}

const METRIC_LABELS: Record<MilestoneMetric, string> = {
  population: "Population totale",
  colonies: "Colonies fondées",
  explored: "Systèmes explorés",
  techs: "Technologies",
};

export function EmpireView({
  game,
  colonies,
  universe,
  exploredSystemIds,
  leaderboard,
  factionStates,
  contracts,
  proposals,
  objectives,
  worldEvents,
  pirateLairs,
  playerId,
  effects,
  now,
  send,
}: Props) {
  const metrics: Record<MilestoneMetric, number> = {
    population: Math.floor(colonies.reduce((s, c) => s + c.population, 0)),
    colonies: colonies.length,
    explored: exploredSystemIds.length,
    techs: game.researched.length,
  };

  return (
    <div className="empire-view">
      <div className="resource-bar">
        {(Object.keys(metrics) as MilestoneMetric[]).map((metric) => (
          <div key={metric} className="resource-cell">
            <span className="resource-name">{METRIC_LABELS[metric]}</span>
            <span className="resource-stock">{metrics[metric]}</span>
          </div>
        ))}
        <div className="resource-cell">
          <span className="resource-name">Univers</span>
          <span className="resource-stock">
            {universe.galaxies.length} galaxies · {allSystems(universe).length} systèmes
          </span>
        </div>
        <div className="resource-cell">
          <span className="resource-name">Influence</span>
          <span className="resource-stock">✦ {Math.floor(game.influence)}</span>
          <span className="resource-rate ok">
            {(influencePerTick(colonies, game.claimedSystemIds.length, effects.influenceMult) >= 0
              ? "+"
              : "") +
              Math.round(
                influencePerTick(colonies, game.claimedSystemIds.length, effects.influenceMult) *
                  1000,
              ) /
                1000}
            /tick
          </span>
        </div>
        <div className="resource-cell">
          <span className="resource-name">Systèmes revendiqués</span>
          <span className="resource-stock">{game.claimedSystemIds.length}</span>
          <span className="resource-rate muted">
            {game.claimedSystemIds
              .map((id) => allSystems(universe).find((s) => s.id === id)?.name ?? id)
              .join(", ") || "aucun"}
          </span>
        </div>
      </div>

      <h3 className="milestones-title">Fil du monde</h3>
      <ul className="milestone-list">
        {objectives
          .filter((o) => o.status === "open")
          .map((o) => (
            <li key={o.id} className="milestone">
              <div className="queue-head">
                <span>🎯 {OBJECTIVE_KIND_LABELS[o.kind]}</span>
                <span className="muted small">{formatDuration(o.deadline - now)}</span>
              </div>
              <span className="small muted">
                {objectiveDetail(o, universe, colonies.length)} · récompense {o.reward} crédits
              </span>
            </li>
          ))}
        {worldEvents.map((e) => (
          <li key={e.id} className="milestone">
            <div className="queue-head">
              <span className={WORLD_EVENT_LABELS[e.kind].tone}>
                {WORLD_EVENT_LABELS[e.kind].icon} {WORLD_EVENT_LABELS[e.kind].name}
                {" — "}
                {worldEventLocation(e, universe)}
              </span>
              <span className="muted small">{formatDuration(e.expiresAt - now)}</span>
            </div>
          </li>
        ))}
        {pirateLairs
          .filter((l) => l.bounty > 0)
          .map((l) => (
            <li key={l.id} className="milestone">
              <div className="queue-head">
                <span>
                  ☠ Repaire pirate —{" "}
                  {allSystems(universe).find((s) => s.id === l.systemId)?.name ?? l.systemId}
                </span>
                <span className="muted small">prime {l.bounty} crédits</span>
              </div>
            </li>
          ))}
        {objectives.filter((o) => o.status === "open").length === 0 &&
          worldEvents.length === 0 &&
          pirateLairs.filter((l) => l.bounty > 0).length === 0 && (
            <li className="small muted">Calme plat — rien à signaler pour l'instant.</li>
          )}
      </ul>

      {leaderboard.length > 1 && (
        <>
          <h3 className="milestones-title">Classement des empires</h3>
          <ul className="milestone-list">
            {leaderboard.map((e, i) => {
              // Une proposition en cours (émise ou reçue) prime sur les boutons de relation :
              // il faut d'abord y répondre / l'annuler avant de proposer autre chose.
              const incoming = proposals.find(
                (p) => p.fromEmpireId === e.id && p.toEmpireId === playerId,
              );
              const outgoing = proposals.find(
                (p) => p.fromEmpireId === playerId && p.toEmpireId === e.id,
              );
              return (
                <li key={e.id} className={`milestone ${e.id === playerId ? "reached" : ""}`}>
                  <div className="queue-head">
                    <span>
                      <span style={{ color: e.color }}>◆</span> #{i + 1} {e.name}
                      {e.id === playerId ? " (vous)" : RELATION_BADGES[e.relation]}
                    </span>
                    <span className="muted small">score {e.score}</span>
                  </div>
                  <span className="small muted">
                    {e.colonies} colonie{e.colonies > 1 ? "s" : ""} · {e.claimed} système
                    {e.claimed > 1 ? "s" : ""} · ✦ {e.influence} · pop {e.population}
                  </span>
                  {e.id !== playerId && (
                    <div className="route-actions">
                      {incoming ? (
                        <>
                          <span className="small muted">
                            Propose {incoming.kind === "nap" ? "un pacte" : "une alliance"}
                          </span>
                          <button
                            className="action-button small"
                            onClick={() =>
                              send({
                                type: "respondRelation",
                                proposalId: incoming.id,
                                accept: true,
                              })
                            }
                          >
                            Accepter
                          </button>
                          <button
                            className="action-button small"
                            onClick={() =>
                              send({
                                type: "respondRelation",
                                proposalId: incoming.id,
                                accept: false,
                              })
                            }
                          >
                            Refuser
                          </button>
                        </>
                      ) : outgoing ? (
                        <>
                          <span className="small muted">
                            Proposition envoyée ({outgoing.kind === "nap" ? "pacte" : "alliance"})
                          </span>
                          <button
                            className="action-button small"
                            onClick={() =>
                              send({ type: "cancelProposal", proposalId: outgoing.id })
                            }
                          >
                            Annuler
                          </button>
                        </>
                      ) : e.relation === "war" ? (
                        <button
                          className="action-button small"
                          onClick={() => send({ type: "makePeace", targetEmpireId: e.id })}
                        >
                          Faire la paix
                        </button>
                      ) : e.relation === "alliance" || e.relation === "nap" ? (
                        <button
                          className="action-button small"
                          onClick={() => send({ type: "breakRelation", targetEmpireId: e.id })}
                        >
                          {e.relation === "alliance" ? "Rompre l'alliance" : "Rompre le pacte"}
                        </button>
                      ) : (
                        <>
                          <button
                            className="action-button small"
                            onClick={() => send({ type: "declareWar", targetEmpireId: e.id })}
                          >
                            Déclarer la guerre
                          </button>
                          <button
                            className="action-button small"
                            onClick={() =>
                              send({ type: "proposeRelation", targetEmpireId: e.id, kind: "nap" })
                            }
                          >
                            Proposer un pacte
                          </button>
                          <button
                            className="action-button small"
                            onClick={() =>
                              send({
                                type: "proposeRelation",
                                targetEmpireId: e.id,
                                kind: "alliance",
                              })
                            }
                          >
                            Proposer une alliance
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3 className="milestones-title">Factions</h3>
      <ul className="milestone-list">
        {FACTION_IDS.map((factionId) => {
          const rep = game.factionRep[factionId] ?? 0;
          const nextTier = [...REP_TIERS].reverse().find((t) => rep < t.min);
          const progress = nextTier ? Math.min(1, rep / nextTier.min) : 1;
          const state = factionStates.find((s) => s.factionId === factionId);
          const mood = FACTION_MOOD_LABELS[state?.mood ?? "neutral"];
          const openContract = contracts.find(
            (c) => c.issuerId === factionId && c.status === "open",
          );
          return (
            <li key={factionId} className={`milestone ${!nextTier ? "reached" : ""}`}>
              <div className="queue-head">
                <span>
                  {FACTIONS[factionId].name} — {repTierName(rep)}
                </span>
                <span className="muted small">
                  {Math.floor(rep)}
                  {nextTier ? `/${nextTier.min}` : " (max)"}
                </span>
              </div>
              <div className="progress">
                <div
                  className={`progress-fill ${!nextTier ? "reached" : ""}`}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className={`small ${mood.tone}`}>{mood.name}</span>
              {openContract && (
                <span className="small muted">
                  {" · "}
                  Demande {openContract.remaining} {RESOURCE_LABELS[openContract.resource]} à{" "}
                  {openContract.pricePerUnit} cr/u — voir Logistique › Contrats
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="milestones-title">Jalons</h3>
      <ul className="milestone-list">
        {MILESTONES.map((m) => {
          const value = metrics[m.metric];
          const reached = value >= m.threshold;
          const progress = Math.min(1, value / m.threshold);
          return (
            <li key={m.id} className={`milestone ${reached ? "reached" : ""}`}>
              <div className="queue-head">
                <span>
                  {reached ? "✓ " : ""}
                  {METRIC_LABELS[m.metric]} : {m.threshold}
                </span>
                <span className="muted small">
                  {Math.min(value, m.threshold)}/{m.threshold}
                </span>
              </div>
              <div className="progress">
                <div
                  className={`progress-fill ${reached ? "reached" : ""}`}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
