import {
  computeGrowthPoints,
  createRng,
  hexKey,
  type HexCoord,
  type Station,
  type StationZone,
  type ZoneTypeId,
} from "@spacesim/shared";
import { useId, useMemo } from "react";
import { ZoomableSvg, type ViewBox } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { zoneTypeLabel } from "./labels.js";
import { zoneColorToken } from "./zonePalette.js";

interface Props {
  station: Station;
  /** Point de croissance actuellement ciblé (formulaire de construction docké). */
  selectedGrowthPoint?: HexCoord | null;
  onSelectGrowthPoint?: (point: HexCoord) => void;
  /** Zone bâtie actuellement ciblée (sous-étape 26.8 — construction d'installation). */
  selectedZoneKey?: string | null;
  onSelectZone?: (zone: StationZone) => void;
}

/** Distance centre-à-coin d'une cellule, en unités de repère SVG local. */
const HEX_SIZE = 42;
/** Rayon des lobes fusionnés par le filtre gooey — légèrement au-delà de la moitié de
 *  l'espacement entre cellules adjacentes, pour qu'elles se touchent visuellement. */
const BLOB_RADIUS = 40;
/** Amplitude du jitter organique (position de rendu seulement, jamais la grille logique). */
const JITTER = 6;
const PADDING = 90;

/** Conversion axial → pixel (hexagones pointe en haut), formule standard. */
function hexPixelPosition(q: number, r: number): { x: number; y: number } {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: HEX_SIZE * 1.5 * r,
  };
}

/** Décalage organique déterministe (position de rendu seulement) — reproductible d'un
 *  rendu à l'autre pour une même station/cellule, jamais aléatoire à chaque affichage. */
function jitter(seed: string): { dx: number; dy: number } {
  const rng = createRng(seed);
  const angle = rng() * Math.PI * 2;
  const dist = rng() * JITTER;
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
}

/** Palette stable dérivée de l'id du type de zone. Le hachage vit désormais dans
 *  `zonePalette.ts` (chantier 33.2) : le modèle 3D de la même station le partage, sans quoi
 *  une zone créée par un admin serait colorée ici et grise là-bas. */
function zoneColorVar(zoneTypeId: string): string {
  return `var(${zoneColorToken(zoneTypeId)})`;
}

/**
 * Constructeur spatial de station (chantier 26) : la station grandit sur une grille
 * hexagonale (`sim/industry/station-layout`), rendue ici comme un amas de cellules qui
 * fusionnent visuellement (filtre SVG "gooey" — flou + seuil de contraste, aucune
 * bibliothèque de géométrie) pour former un contour organique. La position logique
 * (q, r) fait foi pour la simulation ; seule la position de rendu de chaque cellule est
 * légèrement jitterée pour l'irrégularité visuelle. Modelé sur `ShipHullDiagram.tsx`
 * (positions calculées, pas stockées ; clic sur un emplacement → sélection).
 */
export function StationDiagram({
  station,
  selectedGrowthPoint,
  onSelectGrowthPoint,
  selectedZoneKey,
  onSelectZone,
}: Props) {
  const { t } = useTranslation();
  const uid = useId();
  const gooId = `${uid}-goo`;

  const growthPoints = useMemo(() => computeGrowthPoints(station), [station]);
  const queuedByCell = useMemo(
    () =>
      new Map(station.zoneQueue.map((item) => [hexKey(item.q, item.r), item])),
    [station.zoneQueue],
  );

  const home = useMemo<ViewBox>(() => {
    const positions = [
      hexPixelPosition(0, 0),
      ...station.zones.map((z) => hexPixelPosition(z.q, z.r)),
      ...growthPoints.map((p) => hexPixelPosition(p.q, p.r)),
    ];
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    const minX = Math.min(...xs) - PADDING;
    const maxX = Math.max(...xs) + PADDING;
    const minY = Math.min(...ys) - PADDING;
    const maxY = Math.max(...ys) + PADDING;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.zones, growthPoints]);

  return (
    <div className="station-diagram">
      <ZoomableSvg
        home={home}
        className="station-diagram-svg"
        ariaLabel={t("stationDiagram.stationPlan", { name: station.name })}
        zoomInLabel={t("zoomableSvg.zoomIn")}
        zoomOutLabel={t("zoomableSvg.zoomOut")}
        recenterLabel={t("zoomableSvg.recenter")}
      >
        <defs>
          <filter id={gooId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            />
          </filter>
        </defs>

        {/* Couche floutée : hub + cellules bâties/en file, fusionnées en un contour organique. */}
        <g filter={`url(#${gooId})`} className="station-goo-layer">
          <circle cx={0} cy={0} r={BLOB_RADIUS} className="station-hub-blob" />
          {station.zones.map((z) => {
            const pos = hexPixelPosition(z.q, z.r);
            const off = jitter(`${station.id}:${hexKey(z.q, z.r)}`);
            return (
              <circle
                key={hexKey(z.q, z.r)}
                cx={pos.x + off.dx}
                cy={pos.y + off.dy}
                r={BLOB_RADIUS}
                style={{ fill: zoneColorVar(z.zoneTypeId) }}
                className="station-zone-blob"
              />
            );
          })}
          {station.zoneQueue.map((item) => {
            const pos = hexPixelPosition(item.q, item.r);
            const off = jitter(`${station.id}:${hexKey(item.q, item.r)}:queue`);
            return (
              <circle
                key={`q-${hexKey(item.q, item.r)}`}
                cx={pos.x + off.dx}
                cy={pos.y + off.dy}
                r={BLOB_RADIUS}
                style={{ fill: zoneColorVar(item.zoneTypeId) }}
                className="station-zone-blob queued"
              />
            );
          })}
        </g>

        {/* Couche nette : cœur, icônes de zone, points de croissance cliquables. */}
        <circle cx={0} cy={0} r={10} className="station-hub-core" />
        <text y={-16} textAnchor="middle" className="station-hub-label">
          {t("stationDiagram.core")}
        </text>

        {station.zones.map((z) => {
          const pos = hexPixelPosition(z.q, z.r);
          const key = hexKey(z.q, z.r);
          const queued = queuedByCell.get(key);
          const clickable = !!onSelectZone;
          const label =
            zoneTypeLabel(z.zoneTypeId as ZoneTypeId)?.name ?? z.zoneTypeId;
          return (
            <g
              key={key}
              transform={`translate(${pos.x} ${pos.y})`}
              className={`station-zone ${clickable ? "clickable" : ""} ${selectedZoneKey === key ? "selected" : ""}`}
              onClick={clickable ? () => onSelectZone(z) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={
                clickable
                  ? t("stationDiagram.zoneAriaLabel", { name: label })
                  : undefined
              }
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectZone(z);
                      }
                    }
                  : undefined
              }
            >
              <title>{label}</title>
              <circle r={18} className="station-zone-hit" />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                className="station-zone-icon"
              >
                {label.charAt(0).toUpperCase()}
              </text>
              {queued && (
                <circle r={16} className="station-zone-ring queued-ring" />
              )}
            </g>
          );
        })}

        {growthPoints.map((p) => {
          const pos = hexPixelPosition(p.q, p.r);
          const selected =
            selectedGrowthPoint?.q === p.q && selectedGrowthPoint?.r === p.r;
          const clickable = !!onSelectGrowthPoint;
          return (
            <g
              key={hexKey(p.q, p.r)}
              transform={`translate(${pos.x} ${pos.y})`}
              className={`station-growth-point ${clickable ? "clickable" : ""} ${selected ? "selected" : ""}`}
              onClick={clickable ? () => onSelectGrowthPoint(p) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={t("stationDiagram.newZoneSlot")}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectGrowthPoint(p);
                      }
                    }
                  : undefined
              }
            >
              <circle r={11} className="station-growth-point-hit" />
              <path
                d="M-5,0 L5,0 M0,-5 L0,5"
                className="station-growth-point-cross"
              />
            </g>
          );
        })}
      </ZoomableSvg>
    </div>
  );
}
