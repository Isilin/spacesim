import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type Colony,
  type Galaxy,
  type Mission,
  type StarSystem,
  type Territory,
} from "@spacesim/shared";
import { useMemo } from "react";
import { ZoomableSvg, type ViewBox } from "@spacesim/ui";

interface Props {
  galaxy: Galaxy;
  colonies: Colony[];
  missions: Mission[];
  exploredSystemIds: string[];
  claimedSystemIds: string[];
  territories: Territory[];
  selectedId: string | null;
  onSelect: (system: StarSystem) => void;
  onOpenSystem: (system: StarSystem) => void;
}

/** Niveau galaxie : systèmes en nœuds reliés. Clic = sélection, double-clic = vue système. */
export function GalaxyMap({
  galaxy,
  colonies,
  missions,
  exploredSystemIds,
  claimedSystemIds,
  territories,
  selectedId,
  onSelect,
  onOpenSystem,
}: Props) {
  const byId = new Map(galaxy.systems.map((s) => [s.id, s]));
  const territoryColor = new Map(territories.map((t) => [t.systemId, t.ownerColor]));
  const explored = new Set(exploredSystemIds);
  const planetToSystem = new Map(
    galaxy.systems.flatMap((s) => s.planets.map((p) => [p.id, s.id] as const)),
  );
  const colonizedSystems = new Set(
    colonies.map((c) => planetToSystem.get(c.planetId)).filter(Boolean),
  );

  const home = useMemo<ViewBox>(() => ({ x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT }), []);

  const missionLines = missions
    .map((m) => {
      const fromColony = colonies.find((c) => c.id === m.fromColonyId);
      const fromSys = fromColony ? byId.get(planetToSystem.get(fromColony.planetId) ?? "") : null;
      const toSys =
        m.kind === "probe" ? byId.get(m.targetId) : byId.get(planetToSystem.get(m.targetId) ?? "");
      return fromSys && toSys ? { id: m.id, kind: m.kind, fromSys, toSys } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  return (
    <ZoomableSvg className="galaxy-map" home={home} ariaLabel={`Galaxie ${galaxy.name}`}>
      {galaxy.links.map(([a, b]) => {
        const sa = byId.get(a);
        const sb = byId.get(b);
        if (!sa || !sb) return null;
        return (
          <line key={`${a}-${b}`} x1={sa.x} y1={sa.y} x2={sb.x} y2={sb.y} className="jump-link" />
        );
      })}

      {missionLines.map((l) => (
        <line
          key={l.id}
          x1={l.fromSys.x}
          y1={l.fromSys.y}
          x2={l.toSys.x}
          y2={l.toSys.y}
          className={`mission-line ${l.kind}`}
        />
      ))}

      {galaxy.systems.map((sys) => {
        const isExplored = explored.has(sys.id);
        const hasColony = colonizedSystems.has(sys.id);
        return (
          <g
            key={sys.id}
            className={[
              "system",
              selectedId === sys.id ? "selected" : "",
              isExplored ? "explored" : "unexplored",
              hasColony ? "colonized" : "",
            ].join(" ")}
            transform={`translate(${sys.x}, ${sys.y})`}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              if (event.detail === 2) onOpenSystem(sys);
              else onSelect(sys);
            }}
          >
            <circle r={20} className="system-hit" />
            {galaxy.anchorSystemId === sys.id && (
              <rect
                x={-11}
                y={-11}
                width={22}
                height={22}
                className="anchor-ring"
                transform="rotate(45)"
              />
            )}
            {territoryColor.has(sys.id) ? (
              <circle
                r={14}
                className="claim-ring"
                style={{ stroke: territoryColor.get(sys.id), color: territoryColor.get(sys.id) }}
              />
            ) : (
              claimedSystemIds.includes(sys.id) && <circle r={14} className="claim-ring" />
            )}
            {hasColony && <circle r={9} className="colony-ring" />}
            <circle r={5} className="system-star" />
            {sys.station && isExplored && (
              <rect
                x={8}
                y={-4}
                width={7}
                height={7}
                className="station-box"
                transform="rotate(45 11.5 -0.5)"
              />
            )}
            <text y={-14} textAnchor="middle" className="system-label">
              {sys.name}
            </text>
          </g>
        );
      })}
    </ZoomableSvg>
  );
}
