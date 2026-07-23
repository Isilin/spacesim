import {
  gatewayProgressRatio,
  MAP_HEIGHT,
  MAP_WIDTH,
  type Colony,
  type Galaxy,
  type Gateway,
  type Universe,
} from "@spacesim/shared";
import { useMemo, useState } from "react";
import { ZoomableSvg, type ViewBox } from "./ZoomableSvg.js";

interface Props {
  universe: Universe;
  colonies: Colony[];
  exploredSystemIds: string[];
  gateways: Gateway[];
  /** Cadrage imposé par la navigation (recherche, « ma capitale »). */
  focus?: ViewBox | null;
  onSelect: (galaxy: Galaxy) => void;
}

/** Rayon du halo d'une galaxie sur la carte d'univers. */
const HALO = 90;

/** Marge autour de l'amas lors du cadrage d'accueil. */
const PADDING = 160;

/**
 * Seuils de niveau de détail, exprimés en largeur de vue : plus la vue est large,
 * plus on est loin, moins on affiche. Sans cela, un univers de 200 galaxies
 * dégénère en bouillie de texte.
 */
const LABEL_MAX_WIDTH = 4200;
const STATS_MAX_WIDTH = 2400;

/** Niveau univers : les galaxies comme nœuds sur une spirale sans bord, drill-down au clic. */
export function UniverseMap({
  universe,
  colonies,
  exploredSystemIds,
  gateways,
  focus,
  onSelect,
}: Props) {
  const explored = new Set(exploredSystemIds);
  const colonyPlanetIds = new Set(colonies.map((c) => c.planetId));
  const home = universe.galaxies[0];

  // Cadrage d'accueil : tout l'amas connu tient dans la vue, quel que soit son étalement.
  const homeView = useMemo<ViewBox>(() => {
    const xs = universe.galaxies.map((g) => g.x);
    const ys = universe.galaxies.map((g) => g.y);
    const minX = Math.min(...xs) - PADDING;
    const maxX = Math.max(...xs) + PADDING;
    const minY = Math.min(...ys) - PADDING;
    const maxY = Math.max(...ys) + PADDING;
    // On conserve le rapport d'aspect de la carte pour ne pas déformer les halos.
    const width = Math.max(maxX - minX, ((maxY - minY) * MAP_WIDTH) / MAP_HEIGHT);
    const height = (width * MAP_HEIGHT) / MAP_WIDTH;
    return {
      x: (minX + maxX) / 2 - width / 2,
      y: (minY + maxY) / 2 - height / 2,
      width,
      height,
    };
  }, [universe.galaxies]);

  const [view, setView] = useState<ViewBox>(homeView);
  const showLabels = view.width < LABEL_MAX_WIDTH;
  const showStats = view.width < STATS_MAX_WIDTH;

  /** Ne dessiner que les galaxies dans le cadre (marge d'un halo). */
  const visible = universe.galaxies.filter(
    (g) =>
      g.x + HALO >= view.x &&
      g.x - HALO <= view.x + view.width &&
      g.y + HALO >= view.y &&
      g.y - HALO <= view.y + view.height,
  );

  return (
    <ZoomableSvg
      className="galaxy-map"
      home={homeView}
      focus={focus}
      ariaLabel="Carte de l'univers"
      onViewChange={setView}
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
      {visible.map((galaxy) => {
        const gi = universe.galaxies.indexOf(galaxy);
        const exploredCount = galaxy.systems.filter((s) => explored.has(s.id)).length;
        const colonyCount = galaxy.systems
          .flatMap((s) => s.planets)
          .filter((p) => colonyPlanetIds.has(p.id)).length;
        const gateway = gateways.find((g) => g.galaxyId === galaxy.id);
        const reachable = gi === 0 || !!gateway?.active;
        return (
          <g
            key={galaxy.id}
            className={[
              "galaxy-node",
              reachable ? "reachable" : "far",
              colonyCount > 0 ? "settled" : "",
            ].join(" ")}
            transform={`translate(${galaxy.x}, ${galaxy.y})`}
            onClick={() => onSelect(galaxy)}
          >
            <circle r={HALO} className="galaxy-halo" />
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
            {colonyCount > 0 && <circle r={HALO - 6} className="galaxy-owned" />}
            {showLabels && (
              <text y={-100} textAnchor="middle" className="galaxy-label">
                {galaxy.name}
              </text>
            )}
            {showStats && (
              <text y={118} textAnchor="middle" className="galaxy-sub">
                {galaxy.systems.length} systèmes · {exploredCount} explorés
                {colonyCount > 0 ? ` · ${colonyCount} colonies` : ""}
              </text>
            )}
            {showStats && !reachable && gateway && (
              <text y={136} textAnchor="middle" className="galaxy-sub muted">
                {gateway.activatesAt
                  ? "Portail : chantier final…"
                  : `Portail : ${Math.round(gatewayProgressRatio(gateway) * 100)} % financé`}
              </text>
            )}
            {showStats && gateway?.active && (
              <text y={136} textAnchor="middle" className="galaxy-sub gateway-active">
                ◈ Portail actif — gisements ×{galaxy.depositBonus}
              </text>
            )}
          </g>
        );
      })}
    </ZoomableSvg>
  );
}
