import {
  SYSTEM_VIEW_SIZE,
  type Colony,
  type Planet,
  type StarSystem,
} from "@spacesim/shared";
import { useMemo } from "react";
import { ZoomableSvg, type ViewBox } from "./ZoomableSvg.js";

interface Props {
  system: StarSystem;
  colonies: Colony[];
  explored: boolean;
  selectedBodyId: string | null;
  onSelectBody: (planet: Planet) => void;
  onOpenBody: (planet: Planet) => void;
}

const PLANET_COLORS: Record<string, string> = {
  telluric: "#7fb069",
  oceanic: "#4f8fc1",
  volcanic: "#c1574f",
  frozen: "#a8c6dd",
  arid: "#c1a05a",
  gas: "#b08fc9",
};

const PLANET_RADIUS: Record<string, number> = {
  gas: 16,
  telluric: 10,
  oceanic: 10,
  volcanic: 8,
  frozen: 8,
  arid: 8,
};

/** Niveau système : étoile au centre, orbites, planètes, lunes, ceintures. */
export function SystemView({
  system,
  colonies,
  explored,
  selectedBodyId,
  onSelectBody,
  onOpenBody,
}: Props) {
  const c = SYSTEM_VIEW_SIZE / 2;
  const home = useMemo<ViewBox>(
    () => ({ x: 0, y: 0, width: SYSTEM_VIEW_SIZE, height: SYSTEM_VIEW_SIZE }),
    [],
  );
  const colonyPlanetIds = new Set(colonies.map((col) => col.planetId));
  const planets = system.planets.filter((p) => p.kind === "planet");
  const moonsOf = (planetId: string) =>
    system.planets.filter((p) => p.kind === "moon" && p.parentPlanetId === planetId);

  // Échelle : la plus grande orbite (planète ou ceinture) tient dans la vue.
  const maxOrbit = Math.max(
    120,
    ...planets.map((p) => p.orbitRadius),
    ...system.belts.map((b) => b.orbitRadius),
  );
  const scale = (c - 60) / maxOrbit;

  const position = (radius: number, angle: number, cx = c, cy = c) => ({
    x: cx + Math.cos(angle) * radius * scale,
    y: cy + Math.sin(angle) * radius * scale,
  });

  return (
    <ZoomableSvg className="galaxy-map" home={home} ariaLabel={`Système ${system.name}`}>
      <circle cx={c} cy={c} r={18} className="star-core" />
      <text x={c} y={c - 28} textAnchor="middle" className="system-label">
        {system.name}
      </text>

      {system.station && (
        <g className="station-marker" transform={`translate(${c + 46}, ${c - 46})`}>
          <rect x={-7} y={-7} width={14} height={14} className="station-box" transform="rotate(45)" />
          <text y={-14} textAnchor="middle" className="body-label">
            {system.station.name}
          </text>
        </g>
      )}

      {!explored && (
        <text x={c} y={c + 60} textAnchor="middle" className="galaxy-sub muted">
          Système non exploré — envoyez une sonde.
        </text>
      )}

      {system.belts.map((belt) => (
        <circle
          key={belt.id}
          cx={c}
          cy={c}
          r={belt.orbitRadius * scale}
          className="belt-ring"
        />
      ))}

      {planets.map((planet) => {
        const pos = position(planet.orbitRadius, planet.orbitAngle);
        const moons = moonsOf(planet.id);
        const radius = PLANET_RADIUS[planet.type] ?? 8;
        return (
          <g key={planet.id}>
            <circle cx={c} cy={c} r={planet.orbitRadius * scale} className="orbit-ring" />
            {moons.map((moon) => {
              // Orbite de lune : rayon fixe à l'écran (lisible quel que soit le zoom système).
              const moonScreenRadius = 14 + (moon.orbitRadius - 16);
              const mpos = {
                x: pos.x + Math.cos(moon.orbitAngle) * moonScreenRadius,
                y: pos.y + Math.sin(moon.orbitAngle) * moonScreenRadius,
              };
              return (
                <g key={moon.id}>
                  <circle cx={pos.x} cy={pos.y} r={moonScreenRadius} className="orbit-ring moon-orbit" />
                  <g
                    className={`body ${selectedBodyId === moon.id ? "selected" : ""}`}
                    onClick={() => onSelectBody(moon)}
                    onDoubleClick={() => onOpenBody(moon)}
                  >
                    <circle cx={mpos.x} cy={mpos.y} r={8} className="body-hit" />
                    <circle
                      cx={mpos.x}
                      cy={mpos.y}
                      r={3.5}
                      fill={PLANET_COLORS[moon.type]}
                      className="body-dot"
                    />
                    {colonyPlanetIds.has(moon.id) && (
                      <circle cx={mpos.x} cy={mpos.y} r={6.5} className="colony-ring" />
                    )}
                  </g>
                </g>
              );
            })}
            <g
              className={`body ${selectedBodyId === planet.id ? "selected" : ""}`}
              onClick={() => onSelectBody(planet)}
              onDoubleClick={() => onOpenBody(planet)}
            >
              <circle cx={pos.x} cy={pos.y} r={18} className="body-hit" />
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                fill={PLANET_COLORS[planet.type]}
                className="body-dot"
              />
              {colonyPlanetIds.has(planet.id) && (
                <circle cx={pos.x} cy={pos.y} r={radius + 5} className="colony-ring" />
              )}
              <text x={pos.x} y={pos.y - radius - 8} textAnchor="middle" className="body-label">
                {planet.name}
              </text>
            </g>
          </g>
        );
      })}
    </ZoomableSvg>
  );
}
