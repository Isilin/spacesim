import {
  allSystems,
  FACTION_IDS,
  influencePerTick,
  MILESTONES,
  REP_TIERS,
  type Colony,
  type FactionId,
  type GameState,
  type MilestoneMetric,
  type Universe,
} from "@spacesim/shared";
import { FACTION_LABELS, repTierName } from "./labels.js";

interface Props {
  game: GameState;
  colonies: Colony[];
  universe: Universe;
  exploredSystemIds: string[];
}

const METRIC_LABELS: Record<MilestoneMetric, string> = {
  population: "Population totale",
  colonies: "Colonies fondées",
  explored: "Systèmes explorés",
  techs: "Technologies",
};

export function EmpireView({ game, colonies, universe, exploredSystemIds }: Props) {
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
            {(influencePerTick(colonies, game.claimedSystemIds.length) >= 0 ? "+" : "") +
              (Math.round(influencePerTick(colonies, game.claimedSystemIds.length) * 1000) / 1000)}
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
                  {FACTION_LABELS[factionId as FactionId].name} — {repTierName(rep)}
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
