import type { ClientMessage } from "@spacesim/protocol";
import {
  canResearch,
  pathCost,
  researchPath,
  TECH_IDS,
  TECHS,
  techLayout,
  type Colony,
  type GameState,
  type TechBranch,
  type TechId,
} from "@spacesim/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format.js";
import { branchLabel, techLabel } from "./labels.js";
import { Badge, Button, ZoomableSvg, type ViewBox } from "@spacesim/ui";

interface Props {
  game: GameState;
  colonies: Colony[];
  now: number;
  send: (msg: ClientMessage) => void;
}

const BRANCHES: TechBranch[] = [
  "industry",
  "colonization",
  "society",
  "military",
];

/** Géométrie du graphe : une colonne par profondeur, une bande par branche. */
const COL_WIDTH = 210;
const NODE_WIDTH = 158;
const NODE_HEIGHT = 46;
const ROW_HEIGHT = 62;
const BAND_PADDING = 26;
const MARGIN_X = 30;
const MARGIN_Y = 20;

/** Arbre de recherche en graphe : nœuds par branche et profondeur, arêtes de prérequis. */
export function ResearchView({ game, colonies, now, send }: Props) {
  const { t } = useTranslation();
  const researched = game.researched as TechId[];
  const queue = game.researchQueue as TechId[];
  const active = game.research;
  const totalScience = colonies.reduce((s, c) => s + c.resources.science, 0);
  const [selected, setSelected] = useState<TechId | null>(null);
  const [hovered, setHovered] = useState<TechId | null>(null);

  // Position de chaque nœud : bandes empilées par branche, colonnes par profondeur.
  const { nodes, width, height, bands } = useMemo(() => {
    const layout = techLayout();
    const rowsPerBand = new Map<TechBranch, number>();
    for (const [, pos] of layout) {
      rowsPerBand.set(
        pos.branch,
        Math.max(rowsPerBand.get(pos.branch) ?? 0, pos.row + 1),
      );
    }
    const bandTop = new Map<TechBranch, number>();
    let y = MARGIN_Y;
    for (const branch of BRANCHES) {
      bandTop.set(branch, y);
      y += (rowsPerBand.get(branch) ?? 1) * ROW_HEIGHT + BAND_PADDING;
    }
    const nodes = new Map<
      TechId,
      { x: number; y: number; branch: TechBranch }
    >();
    let maxDepth = 0;
    for (const [id, pos] of layout) {
      maxDepth = Math.max(maxDepth, pos.depth);
      nodes.set(id, {
        x: MARGIN_X + pos.depth * COL_WIDTH,
        y: (bandTop.get(pos.branch) ?? 0) + pos.row * ROW_HEIGHT,
        branch: pos.branch,
      });
    }
    const bands = BRANCHES.map((branch) => ({
      branch,
      y: bandTop.get(branch) ?? 0,
      height: (rowsPerBand.get(branch) ?? 1) * ROW_HEIGHT,
    }));
    return {
      nodes,
      bands,
      width: MARGIN_X * 2 + maxDepth * COL_WIDTH + NODE_WIDTH,
      height: y,
    };
  }, []);

  const home = useMemo<ViewBox>(
    () => ({ x: 0, y: 0, width, height }),
    [width, height],
  );

  // Chaîne mise en valeur : celle du nœud survolé (ou sélectionné à défaut).
  const focus = hovered ?? selected;
  const focusChain = useMemo(() => {
    if (!focus) return new Set<TechId>();
    return new Set<TechId>([...researchPath(focus, []), focus]);
  }, [focus]);

  const stateOf = (
    id: TechId,
  ): "done" | "active" | "queued" | "available" | "locked" => {
    if (researched.includes(id)) return "done";
    if (active?.techId === id) return "active";
    if (queue.includes(id)) return "queued";
    return canResearch(id, researched) ? "available" : "locked";
  };

  const detail = selected ? TECHS[selected] : null;
  const detailPath = selected ? researchPath(selected, researched) : [];
  const detailState = selected ? stateOf(selected) : null;

  return (
    <div className="research-view">
      <div className="research-header">
        <Badge>
          {t("researchView.scienceAvailable", {
            value: Math.floor(totalScience),
          })}
        </Badge>
        {active ? (
          <Badge variant="ok">
            {t("researchView.inProgress", {
              tech: techLabel(active.techId as TechId)?.name ?? active.techId,
              duration: formatDuration(active.finishesAt - now),
            })}
          </Badge>
        ) : (
          <Badge>{t("researchView.noResearch")}</Badge>
        )}
        {queue.length > 0 && (
          <Badge>
            {t("researchView.queue", {
              count: queue.length,
              plural: queue.length > 1 ? "s" : "",
            })}
            <Button
              variant="link"
              className="research-clear"
              onClick={() => send({ type: "clearResearchQueue" })}
            >
              {t("researchView.clear")}
            </Button>
          </Badge>
        )}
      </div>

      <div className="research-body">
        <div className="research-graph">
          <ZoomableSvg
            className="tech-graph"
            home={home}
            ariaLabel={t("researchView.treeAriaLabel")}
            zoomInLabel={t("zoomableSvg.zoomIn")}
            zoomOutLabel={t("zoomableSvg.zoomOut")}
            recenterLabel={t("zoomableSvg.recenter")}
          >
            {bands.map((band) => (
              <g key={band.branch}>
                <rect
                  x={0}
                  y={band.y - 12}
                  width={width}
                  height={band.height + 4}
                  className={`tech-band ${band.branch}`}
                />
                <text x={6} y={band.y - 16} className="tech-band-label">
                  {branchLabel(band.branch)}
                </text>
              </g>
            ))}

            {/* Arêtes de prérequis, tracées avant les nœuds. */}
            {TECH_IDS.flatMap((id) =>
              TECHS[id].requires.map((req) => {
                const from = nodes.get(req);
                const to = nodes.get(id);
                if (!from || !to) return null;
                const x1 = from.x + NODE_WIDTH;
                const y1 = from.y + NODE_HEIGHT / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_HEIGHT / 2;
                const mid = (x1 + x2) / 2;
                const highlighted = focusChain.has(id) && focusChain.has(req);
                return (
                  <path
                    key={`${req}-${id}`}
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                    className={`tech-edge ${researched.includes(req) ? "unlocked" : ""} ${
                      highlighted ? "highlighted" : ""
                    }`}
                  />
                );
              }),
            )}

            {TECH_IDS.map((id) => {
              const node = nodes.get(id);
              if (!node) return null;
              const state = stateOf(id);
              const dimmed = focus && !focusChain.has(id);
              return (
                <g
                  key={id}
                  className={`tech-node ${state} ${selected === id ? "selected" : ""} ${
                    dimmed ? "dimmed" : ""
                  }`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseDown={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    setSelected(id);
                  }}
                  onMouseEnter={() => setHovered(id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={3}
                    className="tech-box"
                  />
                  <text x={9} y={19} className="tech-node-name">
                    {techLabel(id).name}
                  </text>
                  <text x={9} y={35} className="tech-node-meta">
                    {state === "done"
                      ? t("researchView.acquired")
                      : state === "active"
                        ? t("researchView.inProgressShort", {
                            duration: formatDuration(active!.finishesAt - now),
                          })
                        : t("researchView.costDuration", {
                            cost: TECHS[id].cost,
                            duration: formatDuration(TECHS[id].durationMs),
                          })}
                  </text>
                  {state === "queued" && (
                    <text
                      x={NODE_WIDTH - 9}
                      y={19}
                      textAnchor="end"
                      className="tech-node-meta"
                    >
                      #{queue.indexOf(id) + 1}
                    </text>
                  )}
                </g>
              );
            })}
          </ZoomableSvg>
        </div>

        <aside className="research-detail">
          {detail && selected ? (
            <>
              <h3>{techLabel(selected).name}</h3>
              <p className="small muted">{techLabel(selected).description}</p>
              <p className="small">
                {branchLabel(detail.branch)} · {detail.cost} science ·{" "}
                {formatDuration(detail.durationMs)}
              </p>
              {detail.requires.length > 0 && (
                <p className="small muted">
                  {t("researchView.requires", {
                    list: detail.requires
                      .map((r) => techLabel(r).name)
                      .join(", "),
                  })}
                </p>
              )}

              {detailState === "done" ? (
                <p className="small ok">{t("researchView.techAcquired")}</p>
              ) : detailState === "active" ? (
                <p className="small ok">
                  {t("researchView.researchInProgress", {
                    duration: formatDuration(active!.finishesAt - now),
                  })}
                </p>
              ) : detailState === "available" ? (
                <Button
                  disabled={!!active || totalScience < detail.cost}
                  title={
                    active
                      ? t("researchView.researchInProgressAlready")
                      : totalScience < detail.cost
                        ? t("researchView.insufficientScience")
                        : ""
                  }
                  onClick={() => send({ type: "research", techId: selected })}
                >
                  {t("researchView.start")}
                </Button>
              ) : (
                <>
                  <p className="small muted">
                    {t("researchView.chainSummary", {
                      count: detailPath.length,
                      cost: pathCost(detailPath),
                    })}
                  </p>
                  <ol className="research-chain small">
                    {detailPath.map((id) => (
                      <li
                        key={id}
                        className={queue.includes(id) ? "queued" : ""}
                      >
                        {techLabel(id).name}
                      </li>
                    ))}
                  </ol>
                  <Button
                    onClick={() =>
                      send({ type: "queueResearch", techId: selected })
                    }
                  >
                    {t("researchView.planChain")}
                  </Button>
                </>
              )}
            </>
          ) : (
            <p className="muted small">{t("researchView.selectHint")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
