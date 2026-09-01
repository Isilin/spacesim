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
}

const ATMOSPHERE_KEYS: Record<Atmosphere, string> = {
  none: "bodyView.atmosphereNone",
  thin: "bodyView.atmosphereThin",
  breathable: "bodyView.atmosphereBreathable",
  toxic: "bodyView.atmosphereToxic",
  dense: "bodyView.atmosphereDense",
};

/**
 * Fiche d'un corps : caractéristiques physiques, gisements, sol occupé (chantier 10).
 *
 * Le schéma orbital SVG qu'elle portait a disparu au chantier 35.6. Il figurait les lunes
 * à leur angle initial, figées, sur un dessin de 320 px sans zoom — le palier corps de la
 * carte montre les mêmes orbites, en 3D et en mouvement. Ce qui reste ici est ce que la
 * carte ne dit pas : des chiffres.
 */
export function BodyView({ system, body, effects, now }: Props) {
  const { t, i18n } = useTranslation();
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
        <div className="body-panels">
          <Panel title={t("bodyView.readings")}>
            <dl className="body-stats">
              <div>
                <dt>{t("bodyView.radius")}</dt>
                <dd>{physicals.radiusKm.toLocaleString(i18n.language)} km</dd>
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
