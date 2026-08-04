import {
  bodyPhysicals,
  isBreathable,
  orbitalCap,
  orbitalUsed,
  popCap,
  usedSlots,
  type Atmosphere,
  type BuildingId,
  type Colony,
  type EmpireEffects,
  type Planet,
  type ResourceId,
  type StarSystem,
} from "@spacesim/shared";
import { useSearchParams } from "react-router-dom";
import { Panel } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { BodyActions } from "./BodyActions.js";
import { buildingLabel, planetTypeLabel, resourceLabel } from "./labels.js";
import { useGameStore } from "./state/game-store.js";
import { selectActiveColony, selectExplored } from "./state/selectors.js";

interface Props {
  system: StarSystem;
  body: Planet;
  effects: EmpireEffects;
  now: number;
  selectedBodyId: string | null;
  onSelectBody: (body: Planet) => void;
  /** Ouvre un autre corps du même système (lune, planète parente). */
  onOpenBody: (body: Planet) => void;
}

const ATMOSPHERE_KEYS: Record<Atmosphere, string> = {
  none: "bodyView.atmosphereNone",
  thin: "bodyView.atmosphereThin",
  breathable: "bodyView.atmosphereBreathable",
  toxic: "bodyView.atmosphereToxic",
  dense: "bodyView.atmosphereDense",
};

const BODY_COLORS: Record<string, string> = {
  telluric: "#7fb069",
  oceanic: "#4f8fc1",
  volcanic: "#c1574f",
  frozen: "#a8c6dd",
  arid: "#c1a05a",
  gas: "#b08fc9",
};

/** Taille du schéma orbital (viewBox carré). */
const SCHEMA = 320;

/** Vue d'un corps : schéma orbital, fiche physique, gisements, sol occupé. */
export function BodyView({
  system,
  body,
  effects,
  now,
  selectedBodyId,
  onSelectBody,
  onOpenBody,
}: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const activeColony = useGameStore(
    selectActiveColony(searchParams.get("colony")),
  );
  const explored = useGameStore(selectExplored(system.id));
  const { colonies, missions, stations, game, send } = useGameStore();
  const parent = body.parentPlanetId
    ? system.planets.find((p) => p.id === body.parentPlanetId)
    : undefined;
  const moons = system.planets.filter((p) => p.parentPlanetId === body.id);
  const physicals = bodyPhysicals(body, parent?.orbitRadius);
  const colony = colonies.find((c) => c.planetId === body.id);
  const station = stations.find((s) => s.bodyId === body.id);
  const color = BODY_COLORS[body.type] ?? "#8899aa";

  const c = SCHEMA / 2;
  // Rayon du corps à l'écran : borné, le schéma n'est pas à l'échelle réelle.
  const bodyRadius = body.kind === "moon" ? 26 : body.type === "gas" ? 46 : 34;
  const moonOrbit = (i: number) => bodyRadius + 26 + i * 24;

  if (!game) return null;

  return (
    <div className="body-view">
      <header className="body-header">
        <div>
          <h2>{body.name}</h2>
          <p className="muted">
            {body.kind === "moon" ? t("bodyView.moon") : t("bodyView.planet")}{" "}
            {planetTypeLabel(body.type).toLowerCase()}
            {parent
              ? t("bodyView.orbitingParent", { parent: parent.name })
              : t("bodyView.orbitingSystem", { system: system.name })}
          </p>
        </div>
        <BodyActions
          body={body}
          colonies={colonies}
          missions={missions}
          activeColony={activeColony}
          game={game}
          effects={effects}
          stations={stations}
          now={now}
          send={send}
        />
      </header>

      {!explored && (
        <p className="small muted">{t("bodyView.notExploredHint")}</p>
      )}

      <div className="body-layout">
        <svg
          className="body-schema"
          viewBox={`0 0 ${SCHEMA} ${SCHEMA}`}
          role="img"
          aria-label={t("bodyView.schemaAriaLabel", { name: body.name })}
        >
          {/* Orbites des lunes, puis les lunes elles-mêmes (cliquables). */}
          {moons.map((moon, i) => (
            <circle
              key={`o-${moon.id}`}
              cx={c}
              cy={c}
              r={moonOrbit(i)}
              className="orbit-ring"
            />
          ))}
          <circle
            cx={c}
            cy={c}
            r={bodyRadius}
            fill={color}
            className="body-dot"
          />
          {colony && (
            <circle cx={c} cy={c} r={bodyRadius + 7} className="colony-ring" />
          )}
          {/* Anneau de soute orbitale : son remplissage dit ce qui est prêt à partir. */}
          {colony && orbitalCap(colony, effects) > 0 && (
            <circle
              cx={c}
              cy={c}
              r={bodyRadius + 14}
              className="orbital-ring"
              pathLength={100}
              strokeDasharray={`${Math.min(100, (orbitalUsed(colony) / orbitalCap(colony, effects)) * 100)} 100`}
            />
          )}
          {/* Anneau de station : rayon distinct de l'anneau de colonie, un corps peut porter
           *  les deux (chantier 24). */}
          {station && (
            <circle
              cx={c}
              cy={c}
              r={bodyRadius + 20}
              className="station-ring"
            />
          )}
          {moons.map((moon, i) => {
            const angle = moon.orbitAngle;
            const x = c + Math.cos(angle) * moonOrbit(i);
            const y = c + Math.sin(angle) * moonOrbit(i);
            return (
              <g
                key={moon.id}
                className={`body ${selectedBodyId === moon.id ? "selected" : ""}`}
                onMouseDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  if (event.detail === 2) onOpenBody(moon);
                  else onSelectBody(moon);
                }}
              >
                <circle cx={x} cy={y} r={12} className="body-hit" />
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill={BODY_COLORS[moon.type]}
                  className="body-dot"
                />
                {colonies.some((col) => col.planetId === moon.id) && (
                  <circle cx={x} cy={y} r={9} className="colony-ring" />
                )}
                <text
                  x={x}
                  y={y - 12}
                  textAnchor="middle"
                  className="body-label"
                >
                  {moon.name}
                </text>
              </g>
            );
          })}
          {/* Encart : position du corps sur son orbite autour de l'étoile (ou de sa planète). */}
          <g
            transform={`translate(${SCHEMA - 58}, 58)`}
            className="orbit-inset"
          >
            <circle r={40} className="orbit-ring" />
            <circle r={4} className="star-core" />
            <circle
              cx={Math.cos((parent ?? body).orbitAngle) * 40}
              cy={Math.sin((parent ?? body).orbitAngle) * 40}
              r={5}
              fill={color}
              className="body-dot"
            />
            <text y={56} textAnchor="middle" className="body-label">
              {parent
                ? t("bodyView.orbitOfParent", { parent: parent.name })
                : t("bodyView.orbitRadius", {
                    radius: Math.round(body.orbitRadius),
                  })}
            </text>
          </g>
        </svg>

        <div className="body-panels">
          <Panel title={t("bodyView.readings")}>
            <dl className="body-stats">
              <div>
                <dt>{t("bodyView.radius")}</dt>
                <dd>{physicals.radiusKm.toLocaleString("fr-FR")} km</dd>
              </div>
              <div>
                <dt>{t("bodyView.gravity")}</dt>
                <dd>{physicals.gravityG} g</dd>
              </div>
              <div>
                <dt>{t("bodyView.temperature")}</dt>
                <dd>{physicals.meanTempC} °C</dd>
              </div>
              <div>
                <dt>{t("bodyView.atmosphere")}</dt>
                <dd className={isBreathable(physicals) ? "ok" : ""}>
                  {t(ATMOSPHERE_KEYS[physicals.atmosphere])}
                </dd>
              </div>
              <div>
                <dt>{t("bodyView.day")}</dt>
                <dd>{physicals.dayLengthHours} h</dd>
              </div>
              <div>
                <dt>{t("bodyView.revolution")}</dt>
                <dd>{physicals.orbitPeriodDays} j</dd>
              </div>
              <div>
                <dt>{t("bodyView.habitability")}</dt>
                <dd>{body.habitability}/100</dd>
              </div>
              <div>
                <dt>{t("bodyView.moons")}</dt>
                <dd>{moons.length}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title={t("bodyView.deposits")}>
            {Object.keys(body.deposits).length > 0 ? (
              <div className="deposits">
                {Object.entries(body.deposits).map(([res, mod]) => (
                  <span key={res} className="deposit">
                    {resourceLabel(res as ResourceId)} ×{mod}
                  </span>
                ))}
              </div>
            ) : (
              <p className="small muted">{t("bodyView.noDeposits")}</p>
            )}
          </Panel>

          <Panel
            title={t("bodyView.ground", {
              used: colony ? usedSlots(colony) : 0,
              max: body.slots,
            })}
          >
            <SlotGrid body={body} colony={colony} />
            {colony ? (
              <p className="small muted">
                {t("bodyView.population", {
                  pop: Math.floor(colony.population),
                  cap: popCap(colony, body, effects),
                  satisfaction: Math.round(colony.satisfaction),
                })}
                {orbitalCap(colony, effects) > 0
                  ? t("bodyView.orbitalHoldSuffix", {
                      used: Math.floor(orbitalUsed(colony)),
                      cap: orbitalCap(colony, effects),
                    })
                  : t("bodyView.noOrbitalDock")}
              </p>
            ) : (
              <p className="small muted">{t("bodyView.noSettlement")}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Grille des emplacements : un carré par emplacement, occupé (par type) ou libre. */
function SlotGrid({
  body,
  colony,
}: { body: Planet; colony: Colony | undefined }) {
  const { t } = useTranslation();
  const built: BuildingId[] = [];
  for (const [id, count] of Object.entries(colony?.buildings ?? {}) as [
    BuildingId,
    number,
  ][]) {
    for (let i = 0; i < (count ?? 0); i++) built.push(id);
  }
  const queued = (colony?.queue ?? []).map((q) => q.buildingId);
  const free = Math.max(0, body.slots - built.length - queued.length);

  return (
    <div className="slot-grid">
      {built.map((id, i) => (
        <span
          key={`b${i}`}
          className="slot built"
          title={buildingLabel(id).name}
        >
          {buildingLabel(id).name.charAt(0)}
        </span>
      ))}
      {queued.map((id, i) => (
        <span
          key={`q${i}`}
          className="slot queued"
          title={`${buildingLabel(id).name}${t("bodyView.inProgress")}`}
        >
          {buildingLabel(id).name.charAt(0)}
        </span>
      ))}
      {Array.from({ length: free }, (_, i) => (
        <span
          key={`f${i}`}
          className="slot free"
          title={t("bodyView.freeSlot")}
        />
      ))}
      {body.slots === 0 && (
        <span className="small muted">{t("bodyView.noSlot")}</span>
      )}
    </div>
  );
}
