import {
  gatewayProgressRatio,
  MAP_HEIGHT,
  MAP_WIDTH,
  type Colony,
  type Galaxy,
  type Gateway,
  type Universe,
} from "@spacesim/shared";

interface Props {
  universe: Universe;
  colonies: Colony[];
  exploredSystemIds: string[];
  gateways: Gateway[];
  onSelect: (galaxy: Galaxy) => void;
}

/** Niveau univers : les galaxies comme nœuds, drill-down au clic. */
export function UniverseMap({ universe, colonies, exploredSystemIds, gateways, onSelect }: Props) {
  const explored = new Set(exploredSystemIds);
  const colonyPlanetIds = new Set(colonies.map((c) => c.planetId));
  const home = universe.galaxies[0];

  return (
    <svg
      className="galaxy-map"
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label="Carte de l'univers"
    >
      {gateways
        .filter((g) => g.active)
        .map((g) => {
          const target = universe.galaxies.find((gal) => gal.id === g.galaxyId);
          if (!target || !home) return null;
          return (
            <line
              key={g.galaxyId}
              x1={home.x}
              y1={home.y}
              x2={target.x}
              y2={target.y}
              className="gateway-line"
            />
          );
        })}
      {universe.galaxies.map((galaxy, gi) => {
        const exploredCount = galaxy.systems.filter((s) => explored.has(s.id)).length;
        const colonyCount = galaxy.systems
          .flatMap((s) => s.planets)
          .filter((p) => colonyPlanetIds.has(p.id)).length;
        const gateway = gateways.find((g) => g.galaxyId === galaxy.id);
        const reachable = gi === 0 || !!gateway?.active;
        return (
          <g
            key={galaxy.id}
            className={`galaxy-node ${reachable ? "reachable" : "far"}`}
            transform={`translate(${galaxy.x}, ${galaxy.y})`}
            onClick={() => onSelect(galaxy)}
          >
            <circle r={90} className="galaxy-halo" />
            {/* Amas d'étoiles décoratif, déterministe par index. */}
            {galaxy.systems.slice(0, 12).map((s, i) => {
              const angle = (i / 12) * Math.PI * 2 + gi;
              const dist = 15 + ((i * 37) % 55);
              return (
                <circle
                  key={s.id}
                  cx={Math.cos(angle) * dist}
                  cy={Math.sin(angle) * dist * 0.6}
                  r={i % 3 === 0 ? 2.5 : 1.5}
                  className="galaxy-star"
                />
              );
            })}
            <text y={-100} textAnchor="middle" className="galaxy-label">
              {galaxy.name}
            </text>
            <text y={118} textAnchor="middle" className="galaxy-sub">
              {galaxy.systems.length} systèmes · {exploredCount} explorés
              {colonyCount > 0 ? ` · ${colonyCount} colonies` : ""}
            </text>
            {!reachable && gateway && (
              <text y={136} textAnchor="middle" className="galaxy-sub muted">
                {gateway.activatesAt
                  ? "Portail : chantier final…"
                  : `Portail : ${Math.round(gatewayProgressRatio(gateway) * 100)} % financé`}
              </text>
            )}
            {gateway?.active && (
              <text y={136} textAnchor="middle" className="galaxy-sub gateway-active">
                ◈ Portail actif — gisements ×{galaxy.depositBonus}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
