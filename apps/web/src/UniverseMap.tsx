import {
  galaxyActivity,
  galaxyLinks,
  galaxyParentIndex,
  gatewayProgressRatio,
  normalizedActivity,
  MAP_HEIGHT,
  MAP_WIDTH,
  type Colony,
  type Contract,
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
  /** Contrats ouverts (chantiers 14/15) : source des hotspots économiques (chantier 17.3). */
  contracts: Contract[];
  /** Cadrage imposé par la navigation (recherche, « ma capitale »). */
  focus?: ViewBox | null;
  onSelect: (galaxy: Galaxy) => void;
}

/** Rayon de la zone de clic / d'espacement d'une galaxie. */
const HALO = 96;
/** Rayon du disque visible d'une galaxie (le glyphe tient dedans). */
const DISC = 60;

/** Marge autour de l'amas lors du cadrage d'accueil. */
const PADDING = 180;

/**
 * Seuils de niveau de détail, exprimés en largeur de vue : plus la vue est large,
 * plus on est loin, moins on affiche.
 */
const LABEL_MAX_WIDTH = 4600;
const STATS_MAX_WIDTH = 2600;

/** Points d'un bras spiral, déterministes par galaxie. */
interface GlyphDot {
  x: number;
  y: number;
  r: number;
  o: number;
}

/**
 * Glyphe d'une galaxie spirale, entièrement déterministe (index + richesse) : cœur
 * lumineux, bras logarithmiques, disque incliné. Remplace l'ancien semis de points
 * qui ne « parlait » pas.
 */
function galaxyGlyph(index: number, depositBonus: number) {
  const arms = 2 + (index % 2); // 2 ou 3 bras
  const rotationDeg = (index * 57) % 360;
  const tilt = 0.42 + (index % 4) * 0.07; // aplatissement du disque (vue inclinée)
  // Teinte : bleu près de la mère, ambre pour les anneaux lointains (plus riches).
  const hue = Math.round(210 - Math.min(1, (depositBonus - 1) / 2) * 168);
  const perArm = 26;
  const spread = 3.0; // enroulement d'un bras (radians)
  const dots: GlyphDot[] = [];
  for (let a = 0; a < arms; a++) {
    const base = (a / arms) * Math.PI * 2;
    for (let i = 0; i < perArm; i++) {
      const t = i / (perArm - 1);
      const theta = base + t * spread;
      const rad = 7 + t * (DISC - 7);
      dots.push({
        x: Math.cos(theta) * rad,
        y: Math.sin(theta) * rad,
        r: 2.7 * (1 - t) + 0.5,
        o: 0.85 * (1 - t * 0.55),
      });
    }
  }
  return { arms, rotationDeg, tilt, hue, dots };
}

/** Niveau univers : galaxies spirales sur la toile, réseau de trous de ver de proche en proche. */
export function UniverseMap({
  universe,
  colonies,
  exploredSystemIds,
  gateways,
  contracts,
  focus,
  onSelect,
}: Props) {
  const explored = new Set(exploredSystemIds);
  const colonyPlanetIds = new Set(colonies.map((c) => c.planetId));

  const links = useMemo(() => galaxyLinks(universe), [universe]);
  const gatewayByGalaxy = useMemo(
    () => new Map(gateways.map((g) => [g.galaxyId, g])),
    [gateways],
  );
  // Zones d'activité économique (chantier 17.3) : dérivées des contrats ouverts, jamais
  // stockées — juste une lecture de « où le monde bat » au moment du rendu.
  const activity = useMemo(
    () => normalizedActivity(galaxyActivity(contracts, universe)),
    [contracts, universe],
  );

  /**
   * Galaxies atteignables : la mère, plus toute galaxie dont le portail est actif ET
   * dont la parente est elle-même atteignable (chaîne complète depuis la mère).
   */
  const reachable = useMemo(() => {
    const set = new Set<number>([0]);
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 1; i < universe.galaxies.length; i++) {
        if (set.has(i)) continue;
        const parent = galaxyParentIndex(universe, i);
        const active = gatewayByGalaxy.get(universe.galaxies[i]!.id)?.active;
        if (active && parent !== null && set.has(parent)) {
          set.add(i);
          changed = true;
        }
      }
    }
    return set;
  }, [universe, gatewayByGalaxy]);

  // Cadrage d'accueil : tout l'amas connu tient dans la vue.
  const homeView = useMemo<ViewBox>(() => {
    const xs = universe.galaxies.map((g) => g.x);
    const ys = universe.galaxies.map((g) => g.y);
    const minX = Math.min(...xs) - PADDING;
    const maxX = Math.max(...xs) + PADDING;
    const minY = Math.min(...ys) - PADDING;
    const maxY = Math.max(...ys) + PADDING;
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

  const inView = (g: Galaxy) =>
    g.x + HALO >= view.x &&
    g.x - HALO <= view.x + view.width &&
    g.y + HALO >= view.y &&
    g.y - HALO <= view.y + view.height;
  const visible = universe.galaxies.filter(inView);

  return (
    <ZoomableSvg
      className="galaxy-map universe-map"
      home={homeView}
      focus={focus}
      ariaLabel="Carte de l'univers"
      onViewChange={setView}
    >
      <defs>
        <radialGradient id="galaxy-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#e6efff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#e6efff" stopOpacity="0" />
        </radialGradient>
        {/* Halo de chaleur économique (chantier 17.3) : où le commerce bat le plus fort. */}
        <radialGradient id="economic-hotspot" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb347" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#ffb347" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Réseau inter-galactique : arêtes de l'arbre de voisinage. */}
      {links.map((link) => {
        const gw = gatewayByGalaxy.get(link.child.id);
        const discovered =
          !!gw?.active && reachable.has(link.parentIndex) && reachable.has(link.childIndex);
        const building = !discovered && reachable.has(link.parentIndex) && !!gw && !gw.active;
        const cls = discovered ? "discovered" : building ? "building" : "potential";
        const mx = (link.parent.x + link.child.x) / 2;
        const my = (link.parent.y + link.child.y) / 2;
        return (
          <g key={`${link.parentIndex}-${link.childIndex}`}>
            <line
              x1={link.parent.x}
              y1={link.parent.y}
              x2={link.child.x}
              y2={link.child.y}
              className={`wormhole ${cls}`}
            />
            {discovered && <circle cx={mx} cy={my} r={4} className="wormhole-node" />}
            {building && showStats && (
              <text x={mx} y={my - 8} textAnchor="middle" className="galaxy-sub muted">
                {gw!.activatesAt
                  ? "chantier final…"
                  : `${Math.round(gatewayProgressRatio(gw!) * 100)} %`}
              </text>
            )}
          </g>
        );
      })}

      {visible.map((galaxy) => {
        const gi = universe.galaxies.indexOf(galaxy);
        const exploredCount = galaxy.systems.filter((s) => explored.has(s.id)).length;
        const colonyCount = galaxy.systems
          .flatMap((s) => s.planets)
          .filter((p) => colonyPlanetIds.has(p.id)).length;
        const isReachable = reachable.has(gi);
        const glyph = galaxyGlyph(gi, galaxy.depositBonus);
        const dotColor = `hsl(${glyph.hue} 72% 74%)`;
        const heat = activity.get(galaxy.id) ?? 0;
        return (
          <g
            key={galaxy.id}
            className={[
              "galaxy-node",
              isReachable ? "reachable" : "far",
              colonyCount > 0 ? "settled" : "",
            ].join(" ")}
            transform={`translate(${galaxy.x}, ${galaxy.y})`}
            onClick={() => onSelect(galaxy)}
          >
            {/* Halo de chaleur économique (chantier 17.3) : rayon et opacité suivent
                l'intensité relative — invisible si la galaxie n'a aucun contrat ouvert. */}
            {heat > 0 && (
              <circle
                r={DISC * (1.4 + heat * 0.9)}
                fill="url(#economic-hotspot)"
                opacity={0.4 + heat * 0.6}
              />
            )}
            {/* Cercle de clic invisible. */}
            <circle r={HALO} className="galaxy-hit" />

            <g
              className="galaxy-glyph"
              transform={`rotate(${glyph.rotationDeg}) scale(1 ${glyph.tilt})`}
            >
              <ellipse
                rx={DISC * 1.1}
                ry={DISC * 1.1}
                className="galaxy-disc"
                style={{ fill: `hsl(${glyph.hue} 60% 52%)` }}
              />
              {glyph.dots.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={dotColor} opacity={d.o} />
              ))}
            </g>
            {/* Cœur lumineux, non incliné pour rester net au centre. */}
            <circle r={20} fill="url(#galaxy-core)" />

            {colonyCount > 0 && <circle r={DISC + 10} className="galaxy-owned" />}

            {showLabels && (
              <text y={-DISC - 16} textAnchor="middle" className="galaxy-label">
                {galaxy.name}
              </text>
            )}
            {showStats && (
              <text y={DISC + 26} textAnchor="middle" className="galaxy-sub">
                {galaxy.systems.length} systèmes · {exploredCount} explorés
                {colonyCount > 0 ? ` · ${colonyCount} colonies` : ""}
              </text>
            )}
            {showStats && isReachable && gi > 0 && (
              <text y={DISC + 42} textAnchor="middle" className="galaxy-sub gateway-active">
                ◈ Relié — gisements ×{galaxy.depositBonus}
              </text>
            )}
            {showStats && heat > 0.5 && (
              <text
                y={isReachable && gi > 0 ? DISC + 58 : DISC + 42}
                textAnchor="middle"
                className="galaxy-sub gateway-active"
              >
                🔥 forte activité économique
              </text>
            )}
          </g>
        );
      })}
    </ZoomableSvg>
  );
}
