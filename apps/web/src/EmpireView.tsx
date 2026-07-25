import {
  allSystems,
  FACTION_IDS,
  FACTIONS,
  influencePerTick,
  MILESTONES,
  REP_TIERS,
  type ClientMessage,
  type Colony,
  type EmpireEffects,
  type GameState,
  type LeaderboardEntry,
  type MilestoneMetric,
  type Universe,
} from "@spacesim/shared";
import { repTierName } from "./labels.js";

interface Props {
  game: GameState;
  colonies: Colony[];
  universe: Universe;
  exploredSystemIds: string[];
  leaderboard: LeaderboardEntry[];
  playerId: string | null;
  effects: EmpireEffects;
  send: (msg: ClientMessage) => void;
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
  playerId,
  effects,
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
            {(influencePerTick(colonies, game.claimedSystemIds.length, effects.influenceMult) >= 0 ? "+" : "") +
              (Math.round(influencePerTick(colonies, game.claimedSystemIds.length, effects.influenceMult) * 1000) / 1000)}
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

      {leaderboard.length > 1 && (
        <>
          <h3 className="milestones-title">Classement des empires</h3>
          <ul className="milestone-list">
            {leaderboard.map((e, i) => (
              <li key={e.id} className={`milestone ${e.id === playerId ? "reached" : ""}`}>
                <div className="queue-head">
                  <span>
                    <span style={{ color: e.color }}>◆</span> #{i + 1} {e.name}
                    {e.id === playerId ? " (vous)" : e.atWar ? " ⚔ en guerre" : ""}
                  </span>
                  <span className="muted small">score {e.score}</span>
                </div>
                <span className="small muted">
                  {e.colonies} colonie{e.colonies > 1 ? "s" : ""} · {e.claimed} système
                  {e.claimed > 1 ? "s" : ""} · ✦ {e.influence} · pop {e.population}
                </span>
                {e.id !== playerId && (
                  <div className="route-actions">
                    {e.atWar ? (
                      <button
                        className="action-button small"
                        onClick={() => send({ type: "makePeace", targetEmpireId: e.id })}
                      >
                        Faire la paix
                      </button>
                    ) : (
                      <button
                        className="action-button small"
                        onClick={() => send({ type: "declareWar", targetEmpireId: e.id })}
                      >
                        Déclarer la guerre
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="milestones-title">Factions</h3>
      <ul className="milestone-list">
        {FACTION_IDS.map((factionId) => {
          const rep = game.factionRep[factionId] ?? 0;
          const nextTier = [...REP_TIERS].reverse().find((t) => rep < t.min);
          const progress = nextTier ? Math.min(1, rep / nextTier.min) : 1;
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
