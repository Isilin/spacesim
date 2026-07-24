import {
  bodyPhysicals,
  isBreathable,
  orbitalCap,
  orbitalUsed,
  popCap,
  usedSlots,
  type Atmosphere,
  type BuildingId,
  type ClientMessage,
  type Colony,
  type EmpireEffects,
  type GameState,
  type Mission,
  type Planet,
  type ResourceId,
  type StarSystem,
} from "@spacesim/shared";
import { BodyActions } from "./BodyActions.js";
import { BUILDING_LABELS, PLANET_TYPE_LABELS, RESOURCE_LABELS } from "./labels.js";

interface Props {
  system: StarSystem;
  body: Planet;
  colonies: Colony[];
  missions: Mission[];
  activeColony: Colony | null;
  effects: EmpireEffects;
  game: GameState;
  explored: boolean;
  now: number;
  send: (msg: ClientMessage) => void;
  /** Ouvre un autre corps du même système (lune, planète parente). */
  onOpenBody: (body: Planet) => void;
}

const ATMOSPHERE_LABELS: Record<Atmosphere, string> = {
  none: "Aucune",
  thin: "Ténue",
  breathable: "Respirable",
  toxic: "Toxique",
  dense: "Dense",
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
  colonies,
  missions,
  activeColony,
  effects,
  game,
  explored,
  now,
  send,
  onOpenBody,
}: Props) {
  const parent = body.parentPlanetId
    ? system.planets.find((p) => p.id === body.parentPlanetId)
    : undefined;
  const moons = system.planets.filter((p) => p.parentPlanetId === body.id);
  const physicals = bodyPhysicals(body, parent?.orbitRadius);
  const colony = colonies.find((c) => c.planetId === body.id);
  const color = BODY_COLORS[body.type] ?? "#8899aa";

  const c = SCHEMA / 2;
  // Rayon du corps à l'écran : borné, le schéma n'est pas à l'échelle réelle.
  const bodyRadius = body.kind === "moon" ? 26 : body.type === "gas" ? 46 : 34;
  const moonOrbit = (i: number) => bodyRadius + 26 + i * 24;

  return (
    <div className="body-view">
      <header className="body-header">
        <div>
          <h2>{body.name}</h2>
          <p className="muted">
            {body.kind === "moon" ? "Lune" : "Planète"} {PLANET_TYPE_LABELS[body.type].toLowerCase()}
            {parent ? ` · en orbite autour de ${parent.name}` : ` · système ${system.name}`}
          </p>
        </div>
        <BodyActions
          body={body}
          colonies={colonies}
          missions={missions}
          activeColony={activeColony}
          game={game}
          now={now}
          send={send}
        />
      </header>

      {!explored && (
        <p className="small muted">
          Système non exploré — les relevés proviennent de l'observation à distance.
        </p>
      )}

      <div className="body-layout">
        <svg
          className="body-schema"
          viewBox={`0 0 ${SCHEMA} ${SCHEMA}`}
          role="img"
          aria-label={`Schéma orbital de ${body.name}`}
        >
          {/* Orbites des lunes, puis les lunes elles-mêmes (cliquables). */}
          {moons.map((moon, i) => (
            <circle key={`o-${moon.id}`} cx={c} cy={c} r={moonOrbit(i)} className="orbit-ring" />
          ))}
          <circle cx={c} cy={c} r={bodyRadius} fill={color} className="body-dot" />
          {colony && <circle cx={c} cy={c} r={bodyRadius + 7} className="colony-ring" />}
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
          {moons.map((moon, i) => {
            const angle = moon.orbitAngle;
            const x = c + Math.cos(angle) * moonOrbit(i);
            const y = c + Math.sin(angle) * moonOrbit(i);
            return (
              <g key={moon.id} className="body" onClick={() => onOpenBody(moon)}>
                <circle cx={x} cy={y} r={12} className="body-hit" />
                <circle cx={x} cy={y} r={6} fill={BODY_COLORS[moon.type]} className="body-dot" />
                {colonies.some((col) => col.planetId === moon.id) && (
                  <circle cx={x} cy={y} r={9} className="colony-ring" />
                )}
                <text x={x} y={y - 12} textAnchor="middle" className="body-label">
                  {moon.name}
                </text>
              </g>
            );
          })}
          {/* Encart : position du corps sur son orbite autour de l'étoile (ou de sa planète). */}
          <g transform={`translate(${SCHEMA - 58}, 58)`} className="orbit-inset">
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
              {parent ? `orbite de ${parent.name}` : `orbite ${Math.round(body.orbitRadius)}`}
            </text>
          </g>
        </svg>

        <div className="body-panels">
          <section className="body-card">
            <h3>Relevés</h3>
            <dl className="body-stats">
              <div>
                <dt>Rayon</dt>
                <dd>{physicals.radiusKm.toLocaleString("fr-FR")} km</dd>
              </div>
              <div>
                <dt>Gravité</dt>
                <dd>{physicals.gravityG} g</dd>
              </div>
              <div>
                <dt>Température</dt>
                <dd>{physicals.meanTempC} °C</dd>
              </div>
              <div>
                <dt>Atmosphère</dt>
                <dd className={isBreathable(physicals) ? "ok" : ""}>
                  {ATMOSPHERE_LABELS[physicals.atmosphere]}
                </dd>
              </div>
              <div>
                <dt>Jour</dt>
                <dd>{physicals.dayLengthHours} h</dd>
              </div>
              <div>
                <dt>Révolution</dt>
                <dd>{physicals.orbitPeriodDays} j</dd>
              </div>
              <div>
                <dt>Habitabilité</dt>
                <dd>{body.habitability}/100</dd>
              </div>
              <div>
                <dt>Lunes</dt>
                <dd>{moons.length}</dd>
              </div>
            </dl>
          </section>

          <section className="body-card">
            <h3>Gisements</h3>
            {Object.keys(body.deposits).length > 0 ? (
              <div className="deposits">
                {Object.entries(body.deposits).map(([res, mod]) => (
                  <span key={res} className="deposit">
                    {RESOURCE_LABELS[res as ResourceId]} ×{mod}
                  </span>
                ))}
              </div>
            ) : (
              <p className="small muted">Aucun gisement notable.</p>
            )}
          </section>

          <section className="body-card">
            <h3>
              Sol{" "}
              <span className="muted small">
                {colony ? usedSlots(colony) : 0}/{body.slots} emplacements
              </span>
            </h3>
            <SlotGrid body={body} colony={colony} />
            {colony ? (
              <p className="small muted">
                Population {Math.floor(colony.population)}/{popCap(colony, body, effects)} ·
                satisfaction {Math.round(colony.satisfaction)}
                {orbitalCap(colony, effects) > 0
                  ? ` · soute orbitale ${Math.floor(orbitalUsed(colony))}/${orbitalCap(colony, effects)}`
                  : " · aucun dock orbital"}
              </p>
            ) : (
              <p className="small muted">Aucune implantation.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Grille des emplacements : un carré par emplacement, occupé (par type) ou libre. */
function SlotGrid({ body, colony }: { body: Planet; colony: Colony | undefined }) {
  const built: BuildingId[] = [];
  for (const [id, count] of Object.entries(colony?.buildings ?? {}) as [BuildingId, number][]) {
    for (let i = 0; i < (count ?? 0); i++) built.push(id);
  }
  const queued = (colony?.queue ?? []).map((q) => q.buildingId);
  const free = Math.max(0, body.slots - built.length - queued.length);

  return (
    <div className="slot-grid">
      {built.map((id, i) => (
        <span key={`b${i}`} className="slot built" title={BUILDING_LABELS[id].name}>
          {BUILDING_LABELS[id].name.charAt(0)}
        </span>
      ))}
      {queued.map((id, i) => (
        <span key={`q${i}`} className="slot queued" title={`${BUILDING_LABELS[id].name} (en cours)`}>
          {BUILDING_LABELS[id].name.charAt(0)}
        </span>
      ))}
      {Array.from({ length: free }, (_, i) => (
        <span key={`f${i}`} className="slot free" title="Emplacement libre" />
      ))}
      {body.slots === 0 && <span className="small muted">Aucun emplacement exploitable.</span>}
    </div>
  );
}
