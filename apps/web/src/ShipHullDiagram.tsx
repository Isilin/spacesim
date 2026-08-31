import {
  CHASSIS,
  MODULES,
  SLOT_TYPES,
  type ChassisId,
  type ChassisKind,
  type ModuleId,
  type SlotType,
} from "@spacesim/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { chassisLabel, moduleLabel, slotLabel } from "./labels.js";
import { hullScale, isHeavyTier } from "./shipScale.js";

export interface SlotRef {
  type: SlotType;
  index: number;
}

interface Props {
  chassisId: ChassisId | "";
  /** Modules montés, dans l'ordre du plan (sert aussi à retrouver l'index réel au clic). */
  modules: ModuleId[];
  /** Miniature en liste (BlueprintList) : plus petit, sans étiquettes ni interaction. */
  compact?: boolean;
  /** Emplacement actuellement ciblé par le cadre de sélection (chantier 13.x). */
  selectedSlot?: SlotRef | null;
  /** Cliquer un emplacement (vide ou rempli) ouvre le cadre de sélection du module (édition uniquement). */
  onSelectSlot?: (slot: SlotRef) => void;
}

/** Rectangle (éventuellement pivoté) centré sur (cx,cy) — utilisé pour les greebles/nacelles. */
function rectPath(
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotDeg = 0,
): string {
  const rot = (rotDeg * Math.PI) / 180;
  const hw = w / 2;
  const hh = h / 2;
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  const pts = corners.map(([x, y]) => {
    const rx = x * Math.cos(rot) - y * Math.sin(rot) + cx;
    const ry = x * Math.sin(rot) + y * Math.cos(rot) + cy;
    return `${rx.toFixed(1)},${ry.toFixed(1)}`;
  });
  return `M${pts[0]} L${pts[1]} L${pts[2]} L${pts[3]} Z`;
}

/** Losange centré sur (cx,cy) de "rayon" r — nacelles rondes/nubs et greebles. */
function diamondPath(cx: number, cy: number, r: number): string {
  return `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`;
}

interface NacelleArt {
  shape: string;
  glow: { x: number; y: number; r: number };
}
interface AccentArt {
  /** Path de la forme signature (verrière/foreuse/dôme/radôme/rail…). */
  d: string;
  /** Nom de custom property CSS (ex. "--slot-weapon") — teinte liée au rôle du châssis. */
  token: string;
}
interface HullArt {
  outline: string;
  /** Plaques de blindage segmenté, en retrait du contour. */
  plates: string[];
  /** Vraies formes de moteur (pas un simple point) + position de la lueur de tuyère. */
  nacelles: NacelleArt[];
  /** Élément(s) signature, teinté(s) selon le rôle du châssis. */
  accents: AccentArt[];
  /** Petits reliefs de surface (hublots, caissons, rivets, vents…), masqués en compact. */
  greebles: string[];
  /** Traits fins (coutures de coque), masqués en compact. */
  detailLines: string[];
}
interface HullArtExtra {
  plates?: string[];
  nacelles?: NacelleArt[];
  accents?: AccentArt[];
}

/**
 * Art de coque par famille de châssis (repère "0 0 160 220", nez en haut), à la
 * Stellaris/Endless Space : contour + blindage segmenté + nacelles + élément signature +
 * greebles. Composé à la main (pas de génération aléatoire) pour un rendu maîtrisé.
 */
const HULL_ART: Record<ChassisKind, HullArt> = {
  generic: {
    outline: "M80 10 L115 60 L105 200 L80 215 L55 200 L45 60 Z",
    plates: [
      "M107,65 L99,69 L92,185 L100,189 Z",
      "M53,65 L61,69 L68,185 L60,189 Z",
    ],
    nacelles: [
      {
        shape: "M64,195 L96,195 L87,213 L73,213 Z",
        glow: { x: 80, y: 208, r: 7 },
      },
      { shape: diamondPath(60, 178, 5), glow: { x: 60, y: 178, r: 3 } },
      { shape: diamondPath(100, 178, 5), glow: { x: 100, y: 178, r: 3 } },
    ],
    accents: [{ d: "M80,16 L89,27 L80,42 L71,27 Z", token: "--accent" }],
    greebles: [
      rectPath(63, 85, 7, 11, -8),
      rectPath(97, 85, 7, 11, 8),
      rectPath(63, 135, 7, 13, -6),
      rectPath(97, 135, 7, 13, 6),
      rectPath(70, 178, 8, 5, 0),
      rectPath(90, 178, 8, 5, 0),
    ],
    detailLines: ["M80 22 L80 195", "M62 70 L62 185", "M98 70 L98 185"],
  },
  military: {
    outline:
      "M80 5 L95 60 L150 110 L100 130 L95 210 L65 210 L60 130 L10 110 L65 60 Z",
    plates: [
      "M95,63 L145,108 L128,116 L98,90 Z",
      "M65,63 L15,108 L32,116 L62,90 Z",
      "M148,112 L100,128 L104,140 L138,124 Z",
      "M12,112 L60,128 L56,140 L22,124 Z",
    ],
    nacelles: [
      {
        shape: "M118,100 L138,106 L132,122 L114,116 Z",
        glow: { x: 126, y: 111, r: 6 },
      },
      {
        shape: "M42,100 L22,106 L28,122 L46,116 Z",
        glow: { x: 34, y: 111, r: 6 },
      },
    ],
    accents: [{ d: "M80,12 L84,58 L80,66 L76,58 Z", token: "--slot-weapon" }],
    greebles: [
      diamondPath(50, 48, 4),
      diamondPath(110, 48, 4),
      rectPath(40, 95, 10, 3, -25),
      rectPath(120, 95, 10, 3, 25),
      rectPath(45, 120, 10, 3, 20),
      rectPath(115, 120, 10, 3, -20),
    ],
    detailLines: ["M80 15 L80 125", "M67 62 L67 205", "M93 62 L93 205"],
  },
  freighter: {
    outline:
      "M70 15 L90 15 L90 40 L130 55 L130 175 L90 190 L90 210 L70 210 L70 190 L30 175 L30 55 L70 40 Z",
    plates: [
      rectPath(80, 75, 84, 26, 0),
      rectPath(80, 110, 84, 26, 0),
      rectPath(80, 145, 84, 26, 0),
    ],
    nacelles: [
      {
        shape: "M35,192 L125,192 L112,212 L48,212 Z",
        glow: { x: 80, y: 206, r: 9 },
      },
      { shape: diamondPath(30, 185, 5), glow: { x: 30, y: 185, r: 3 } },
      { shape: diamondPath(130, 185, 5), glow: { x: 130, y: 185, r: 3 } },
    ],
    accents: [{ d: rectPath(65, 28, 18, 14, 0), token: "--border-bright" }],
    greebles: [
      rectPath(40, 62, 6, 2, 0),
      rectPath(120, 62, 6, 2, 0),
      rectPath(40, 188, 6, 2, 0),
      rectPath(120, 188, 6, 2, 0),
    ],
    detailLines: [
      "M38 60 L38 190",
      "M122 60 L122 190",
      "M38 92 L122 92",
      "M38 127 L122 127",
      "M38 162 L122 162",
    ],
  },
  miner: {
    outline: "M80 5 L88 40 L125 70 L120 180 L80 210 L40 180 L35 70 L72 40 Z",
    plates: [
      "M50,45 L110,45 L118,75 L42,75 Z",
      "M122,72 L116,178 L108,182 L114,74 Z",
      "M38,72 L44,178 L52,182 L46,74 Z",
    ],
    nacelles: [
      {
        shape: "M50,192 L110,192 L100,212 L60,212 Z",
        glow: { x: 80, y: 206, r: 11 },
      },
    ],
    accents: [{ d: "M80,3 L86,32 L80,42 L74,32 Z", token: "--slot-utility" }],
    greebles: [
      rectPath(45, 95, 4, 16, -10),
      rectPath(115, 95, 4, 16, 10),
      rectPath(45, 140, 4, 16, -8),
      rectPath(115, 140, 4, 16, 8),
    ],
    detailLines: [
      "M80 15 L80 42",
      "M45 78 L45 172",
      "M115 78 L115 172",
      "M80 78 L80 188",
    ],
  },
  colonizer: {
    outline:
      "M80 10 C130 10 140 70 130 110 C140 150 120 200 80 215 C40 200 20 150 30 110 C20 70 30 10 80 10 Z",
    plates: [],
    nacelles: [
      { shape: diamondPath(50, 122, 4), glow: { x: 50, y: 122, r: 3 } },
      { shape: diamondPath(68, 126, 4), glow: { x: 68, y: 126, r: 3 } },
      { shape: diamondPath(92, 126, 4), glow: { x: 92, y: 126, r: 3 } },
      { shape: diamondPath(110, 122, 4), glow: { x: 110, y: 122, r: 3 } },
    ],
    accents: [
      { d: "M62,20 C62,8 98,8 98,20 C98,30 62,30 62,20 Z", token: "--ok" },
      {
        d: "M22,115 C22,105 138,105 138,115 C138,125 22,125 22,115 Z",
        token: "--ok",
      },
    ],
    greebles: [
      diamondPath(40, 115, 2.5),
      diamondPath(56, 117, 2.5),
      diamondPath(104, 117, 2.5),
      diamondPath(120, 115, 2.5),
    ],
    detailLines: ["M80 32 L80 62"],
  },
  explorer: {
    outline:
      "M80 5 L88 100 L140 130 L100 140 L92 210 L68 210 L60 140 L20 130 L72 100 Z",
    plates: ["M76,20 L84,20 L82,135 L78,135 Z"],
    nacelles: [
      { shape: rectPath(132, 128, 14, 7, 20), glow: { x: 140, y: 130, r: 4 } },
      { shape: rectPath(28, 128, 14, 7, -20), glow: { x: 20, y: 130, r: 4 } },
    ],
    accents: [{ d: diamondPath(80, 14, 9), token: "--slot-defense" }],
    greebles: [
      diamondPath(80, 55, 3),
      diamondPath(80, 80, 3),
      rectPath(72, 10, 3, 10, -15),
      rectPath(88, 10, 3, 10, 15),
    ],
    detailLines: [
      "M70 14 L90 14",
      "M80 15 L80 95",
      "M65 100 L65 205",
      "M95 100 L95 205",
    ],
  },
};

/**
 * Couche additionnelle pour le châssis au tonnage le plus élevé de sa famille (cf.
 * `isHeavyTier`) — les deux vaisseaux d'une même famille restent reconnaissables tout en
 * étant visuellement distincts (ex. scout_frame vs standard_hull).
 */
const HEAVY_EXTRA: Partial<Record<ChassisKind, HullArtExtra>> = {
  generic: {
    plates: ["M74,70 L86,70 L83,183 L77,183 Z"],
    nacelles: [
      { shape: diamondPath(80, 180, 6), glow: { x: 80, y: 180, r: 4 } },
    ],
  },
  military: {
    plates: [
      "M100,60 L150,110 L140,118 L96,86 Z",
      "M60,60 L10,110 L20,118 L64,86 Z",
    ],
    nacelles: [
      { shape: diamondPath(80, 205, 7), glow: { x: 80, y: 205, r: 5 } },
    ],
    accents: [{ d: "M72,14 L75,56 L72,62 L69,56 Z", token: "--slot-weapon" }],
  },
  freighter: {
    plates: [rectPath(80, 175, 76, 20, 0)],
    nacelles: [
      { shape: rectPath(80, 214, 50, 6, 0), glow: { x: 80, y: 214, r: 5 } },
    ],
  },
};

/** Position verticale de la bande de chaque type d'emplacement (nez en haut). */
const BAND_Y: Record<SlotType, number> = {
  weapon: 55,
  utility: 108,
  defense: 150,
  propulsion: 192,
};
/** Demi-largeur de la bande — les emplacements s'y répartissent symétriquement. */
const BAND_HALF_WIDTH: Record<SlotType, number> = {
  weapon: 42,
  utility: 46,
  defense: 40,
  propulsion: 30,
};

function slotPositions(
  type: SlotType,
  count: number,
): { x: number; y: number }[] {
  if (count <= 0) return [];
  const y = BAND_Y[type];
  const hw = BAND_HALF_WIDTH[type];
  if (count === 1) return [{ x: 80, y }];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1) - 0.5;
    return { x: 80 + t * 2 * hw, y };
  });
}

/**
 * Position pixel d'un emplacement pour un châssis/taille de rendu donnés — permet au parent
 * d'ancrer le cadre de sélection et sa ligne repère sans dupliquer la géométrie du schéma.
 */
export function slotPixelPosition(
  chassisId: ChassisId,
  type: SlotType,
  index: number,
  size: number,
): { x: number; y: number } {
  const chassis = CHASSIS[chassisId];
  const count = chassis?.slots[type] ?? 0;
  const pos = slotPositions(type, count)[index] ?? { x: 80, y: BAND_Y[type] };
  return { x: (pos.x / 160) * size, y: (pos.y / 220) * (size * 1.375) };
}

/** Regroupe les modules par type d'emplacement, en conservant leur index réel dans le plan. */
function groupBySlot(
  modules: ModuleId[],
): Record<SlotType, { id: ModuleId; index: number }[]> {
  const groups: Record<SlotType, { id: ModuleId; index: number }[]> = {
    weapon: [],
    defense: [],
    propulsion: [],
    utility: [],
  };
  modules.forEach((id, index) => {
    const def = MODULES[id];
    if (def) groups[def.slot].push({ id, index });
  });
  return groups;
}

/**
 * Schéma de coque (chantier 13) : art détaillé par famille de châssis (blindage, nacelles,
 * élément signature, greebles) + emplacements positionnés, à la Stellaris/Endless Space. Purement
 * visuel — les mécaniques (slots, budgets) restent calculées par `sim/design.ts`, ce composant
 * ne fait que les représenter.
 */
export function ShipHullDiagram({
  chassisId,
  modules,
  compact,
  selectedSlot,
  onSelectSlot,
}: Props) {
  const { t } = useTranslation();
  const chassis = chassisId ? CHASSIS[chassisId] : null;
  const size = compact ? 72 : 200;
  const uid = useId();
  const fillId = `${uid}-fill`;
  const engineId = `${uid}-engine`;

  if (!chassis) {
    return (
      <div
        className={`hull-diagram ${compact ? "compact" : ""} empty`}
        style={{ width: size, height: size * 1.375 }}
      >
        <span className="muted small">{t("shipHullDiagram.noChassis")}</span>
      </div>
    );
  }

  const scale = hullScale(chassis);
  const grouped = groupBySlot(modules);
  const art = HULL_ART[chassis.kind];
  const extra = isHeavyTier(chassis.id) ? HEAVY_EXTRA[chassis.kind] : undefined;
  const plates = extra?.plates ? [...art.plates, ...extra.plates] : art.plates;
  const nacelles = extra?.nacelles
    ? [...art.nacelles, ...extra.nacelles]
    : art.nacelles;
  const accents = extra?.accents
    ? [...art.accents, ...extra.accents]
    : art.accents;

  return (
    <div className={`hull-diagram ${compact ? "compact" : ""}`}>
      <svg
        viewBox="0 0 160 220"
        width={size}
        height={size * 1.375}
        role="img"
        aria-label={t("shipHullDiagram.ariaLabel", {
          chassis: chassisLabel(chassis.id).name,
        })}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="hull-fill-stop-a" />
            <stop offset="100%" className="hull-fill-stop-b" />
          </linearGradient>
          <radialGradient id={engineId}>
            <stop offset="0%" className="hull-engine-stop-a" />
            <stop offset="100%" className="hull-engine-stop-b" />
          </radialGradient>
        </defs>
        <g transform={`translate(80 110) scale(${scale}) translate(-80 -110)`}>
          <path
            d={art.outline}
            className="hull-shape"
            style={{ fill: `url(#${fillId})` }}
          />
          {!compact &&
            plates.map((d, i) => <path key={i} d={d} className="hull-plate" />)}
          {nacelles.map((n, i) => (
            <g key={i}>
              <path d={n.shape} className="hull-nacelle" />
              <circle
                cx={n.glow.x}
                cy={n.glow.y}
                r={n.glow.r}
                className="hull-engine"
                style={{ fill: `url(#${engineId})` }}
              />
            </g>
          ))}
          {accents.map((a, i) => (
            <path
              key={i}
              d={a.d}
              className="hull-accent"
              style={{ fill: `var(${a.token})`, stroke: `var(${a.token})` }}
            />
          ))}
          {!compact &&
            art.greebles.map((d, i) => (
              <path key={i} d={d} className="hull-greeble" />
            ))}
          {!compact &&
            art.detailLines.map((d, i) => (
              <path key={i} d={d} className="hull-detail" />
            ))}
        </g>
        {SLOT_TYPES.map((type) =>
          Array.from({ length: chassis.slots[type] }, (_, i) => {
            const pos = slotPositions(type, chassis.slots[type])[i]!;
            const filled = grouped[type][i];
            const label = filled ? moduleLabel(filled.id).name : undefined;
            const clickable = !!onSelectSlot;
            const selected =
              selectedSlot?.type === type && selectedSlot.index === i;
            return (
              <g
                key={`${type}-${i}`}
                transform={`translate(${pos.x} ${pos.y})`}
                className={`hull-slot slot-${type} ${filled ? "filled" : "empty"} ${clickable ? "clickable" : ""} ${selected ? "selected" : ""}`}
                onClick={
                  clickable ? () => onSelectSlot({ type, index: i }) : undefined
                }
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={
                  clickable
                    ? label
                      ? t("shipHullDiagram.editModule", { module: label })
                      : t("shipHullDiagram.chooseModule", {
                          slot: slotLabel(type),
                        })
                    : undefined
                }
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectSlot({ type, index: i });
                        }
                      }
                    : undefined
                }
              >
                {label && <title>{label}</title>}
                <circle r={compact ? 5 : 8} />
                {!compact && filled && (
                  <text y={18} textAnchor="middle" className="hull-slot-label">
                    {label}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
