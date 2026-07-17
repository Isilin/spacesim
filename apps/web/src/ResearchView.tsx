import {
  canResearch,
  TECH_IDS,
  TECHS,
  type ClientMessage,
  type Colony,
  type GameState,
  type TechBranch,
  type TechId,
} from "@spacesim/shared";
import { BRANCH_LABELS, TECH_LABELS } from "./labels.js";

interface Props {
  game: GameState;
  colonies: Colony[];
  now: number;
  send: (msg: ClientMessage) => void;
}

const BRANCHES: TechBranch[] = ["industry", "colonization", "society", "military"];

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  if (m > 0) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

export function ResearchView({ game, colonies, now, send }: Props) {
  const researched = game.researched as TechId[];
  const active = game.research;
  const totalScience = colonies.reduce((s, c) => s + c.resources.science, 0);

  return (
    <div className="research-view">
      <div className="research-header">
        <span className="stat">Science disponible : {Math.floor(totalScience)}</span>
        {active ? (
          <span className="stat ok">
            Recherche : {TECH_LABELS[active.techId as TechId]?.name ?? active.techId} —{" "}
            {formatDuration(active.finishesAt - now)}
          </span>
        ) : (
          <span className="stat muted">Aucune recherche en cours</span>
        )}
      </div>

      <div className="research-columns">
        {BRANCHES.map((branch) => (
          <section key={branch} className="research-branch">
            <h3>{BRANCH_LABELS[branch]}</h3>
            <ul className="tech-list">
              {TECH_IDS.filter((id) => TECHS[id].branch === branch).map((id) => {
                const tech = TECHS[id];
                const done = researched.includes(id);
                const available = canResearch(id, researched);
                const isActive = active?.techId === id;
                const affordable = totalScience >= tech.cost;
                return (
                  <li
                    key={id}
                    className={`tech ${done ? "done" : available ? "available" : "locked"}`}
                  >
                    <div className="tech-head">
                      <strong>{TECH_LABELS[id].name}</strong>
                      {done && <span className="ok small">✓</span>}
                    </div>
                    <p className="small muted">{TECH_LABELS[id].description}</p>
                    {!done && (
                      <div className="tech-meta small">
                        <span>
                          {tech.cost} science · {formatDuration(tech.durationMs)}
                        </span>
                        {tech.requires.length > 0 && (
                          <span className="muted">
                            Requiert : {tech.requires.map((r) => TECH_LABELS[r].name).join(", ")}
                          </span>
                        )}
                      </div>
                    )}
                    {isActive && (
                      <p className="small ok">En cours — {formatDuration(active!.finishesAt - now)}</p>
                    )}
                    {!done && !isActive && available && (
                      <button
                        className="action-button"
                        disabled={!!active || !affordable}
                        title={
                          active
                            ? "Une recherche est déjà en cours"
                            : !affordable
                              ? "Science insuffisante"
                              : ""
                        }
                        onClick={() => send({ type: "research", techId: id })}
                      >
                        Lancer
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
