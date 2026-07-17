import {
  CLAIM_COST,
  COLONY_SHIP_COST,
  colonizeInfluenceCost,
  OUTPOST_COST,
  OUTPOST_STOCK_CAP,
  PROBE_COST_CREDITS,
  type ClientMessage,
  type Colony,
  type EmpireEffects,
  type GameState,
  type MiningOutpost,
  type Mission,
  type ResourceId,
  type Route,
  type StarSystem,
  type StationMarket,
  type Universe,
} from "@spacesim/shared";
import { PLANET_TYPE_LABELS, RESOURCE_LABELS } from "./labels.js";
import { StationPanel } from "./StationPanel.js";

interface Props {
  system: StarSystem;
  colonies: Colony[];
  missions: Mission[];
  explored: boolean;
  /** Colonie d'origine des sondes et vaisseaux coloniaux. */
  activeColony: Colony | null;
  effects: EmpireEffects;
  markets: StationMarket[];
  universe: Universe;
  outposts: MiningOutpost[];
  game: GameState;
  routes: Route[];
  portalLinks: [string, string][];
  now: number;
  send: (msg: ClientMessage) => void;
}

function formatEta(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

const SHIP_COST_TEXT = Object.entries(COLONY_SHIP_COST)
  .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
  .join(" · ");

const OUTPOST_COST_TEXT = Object.entries(OUTPOST_COST)
  .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
  .join(" · ");

export function SystemPanel({
  system,
  colonies,
  missions,
  explored,
  activeColony,
  effects,
  markets,
  universe,
  outposts,
  game,
  routes,
  portalLinks,
  now,
  send,
}: Props) {
  const probeMission = missions.find((m) => m.kind === "probe" && m.targetId === system.id);
  const probeCost = Math.round(PROBE_COST_CREDITS * effects.probeCostMult);

  if (!explored) {
    return (
      <>
        <h2>{system.name}</h2>
        <p className="muted">Système non exploré.</p>
        {probeMission ? (
          <p className="small ok">Sonde en route — {formatEta(probeMission.arrivesAt - now)}</p>
        ) : (
          <button
            className="action-button"
            disabled={!activeColony || activeColony.resources.credits < probeCost}
            onClick={() =>
              activeColony && send({ type: "probe", colonyId: activeColony.id, systemId: system.id })
            }
          >
            Sonder ({probeCost} crédits)
          </button>
        )}
      </>
    );
  }

  const renderBody = (p: (typeof system.planets)[number]) => {
    const colony = colonies.find((c) => c.planetId === p.id);
    const shipMission = missions.find((m) => m.kind === "colonize" && m.targetId === p.id);
    const colonizable = !colony && !shipMission && p.type !== "gas";
    const affordable =
      activeColony &&
      (Object.entries(COLONY_SHIP_COST) as [ResourceId, number][]).every(
        ([res, n]) => activeColony.resources[res] >= n,
      );
    return (
      <li key={p.id} className={`planet ${p.kind === "moon" ? "moon-row" : ""}`}>
        <div className="planet-head">
          <strong>
            {p.kind === "moon" ? "↳ " : ""}
            {p.name}
          </strong>
          <span className="muted">
            {p.kind === "moon" ? "Lune " : ""}
            {PLANET_TYPE_LABELS[p.type]}
          </span>
        </div>
        <div className="planet-stats">
          <span>Habitabilité {p.habitability}</span>
          <span>{p.slots} emplacements</span>
        </div>
        {Object.keys(p.deposits).length > 0 && (
          <div className="deposits">
            {Object.entries(p.deposits).map(([res, mod]) => (
              <span key={res} className="deposit">
                {RESOURCE_LABELS[res as ResourceId]} ×{mod}
              </span>
            ))}
          </div>
        )}
        {colony && <p className="small ok">● {colony.name}</p>}
        {shipMission && (
          <p className="small ok">
            Vaisseau colonial en route — {formatEta(shipMission.arrivesAt - now)}
          </p>
        )}
        {colonizable && (
          <button
            className="action-button"
            disabled={!affordable || game.influence < nextColonyInfluence}
            title={`Coût : ${SHIP_COST_TEXT}${nextColonyInfluence > 0 ? ` · ${nextColonyInfluence} ✦` : ""}`}
            onClick={() =>
              activeColony && send({ type: "colonize", colonyId: activeColony.id, planetId: p.id })
            }
          >
            Coloniser{nextColonyInfluence > 0 ? ` (${nextColonyInfluence} ✦)` : ""}
          </button>
        )}
      </li>
    );
  };

  const planets = system.planets.filter((p) => p.kind === "planet");
  const moonCount = system.planets.length - planets.length;

  const claimed = game.claimedSystemIds.includes(system.id);
  const hasOwnColony = colonies.some(
    (c) => system.planets.some((p) => p.id === c.planetId),
  );
  const nextColonyInfluence = colonizeInfluenceCost(
    colonies.length + missions.filter((m) => m.kind === "colonize").length,
  );

  return (
    <>
      <h2>{system.name}</h2>
      <p className="muted">
        {planets.length} planètes
        {moonCount > 0 ? `, ${moonCount} lunes` : ""}
        {system.belts.length > 0 ? `, ${system.belts.length} ceintures` : ""}
        {system.station ? ", 1 station" : ""}
      </p>
      {claimed ? (
        <p className="small claim-badge">
          ✦ Système revendiqué — production +15 %{" "}
          <button
            className="action-button"
            onClick={() => send({ type: "unclaimSystem", systemId: system.id })}
          >
            Abandonner
          </button>
        </p>
      ) : hasOwnColony ? (
        <button
          className="action-button"
          disabled={game.influence < CLAIM_COST}
          title={game.influence < CLAIM_COST ? "Influence insuffisante" : ""}
          onClick={() => send({ type: "claimSystem", systemId: system.id })}
        >
          Revendiquer le système ({CLAIM_COST} ✦)
        </button>
      ) : null}
      {system.station && (
        <StationPanel
          station={system.station}
          market={markets.find((m) => m.stationId === system.station!.id)}
          activeColony={activeColony}
          missions={missions}
          universe={universe}
          transferSpeedMult={effects.transferSpeedMult}
          factionRep={game.factionRep}
          routes={routes}
          portalLinks={portalLinks}
          now={now}
          send={send}
        />
      )}
      <ul className="planet-list">
        {planets.flatMap((p) => [
          renderBody(p),
          ...system.planets.filter((m) => m.kind === "moon" && m.parentPlanetId === p.id).map(renderBody),
        ])}
        {system.belts.map((belt) => {
          const outpost = outposts.find((o) => o.beltId === belt.id);
          const buildMission = missions.find(
            (m) => m.kind === "build_outpost" && m.targetId === belt.id,
          );
          const outpostAffordable =
            activeColony &&
            (Object.entries(OUTPOST_COST) as [ResourceId, number][]).every(
              ([res, n]) => activeColony.resources[res] >= n,
            );
          return (
            <li key={belt.id} className="planet moon-row">
              <div className="planet-head">
                <strong>☄ {belt.name}</strong>
                <span className="muted">Astéroïdes</span>
              </div>
              <div className="deposits">
                {Object.entries(belt.deposits).map(([res, mod]) => (
                  <span key={res} className="deposit">
                    {RESOURCE_LABELS[res as ResourceId]} ×{mod}
                  </span>
                ))}
              </div>
              {outpost ? (
                <p className={`small ${outpost.oreStock >= OUTPOST_STOCK_CAP ? "ko" : "ok"}`}>
                  ⛏ Avant-poste — stock {Math.floor(outpost.oreStock)}/{OUTPOST_STOCK_CAP}
                  {outpost.oreStock >= OUTPOST_STOCK_CAP ? " — PLEIN, extraction stoppée" : ""}
                </p>
              ) : buildMission ? (
                <p className="small ok">
                  Chantier en route — {formatEta(buildMission.arrivesAt - now)}
                </p>
              ) : (
                <button
                  className="action-button"
                  disabled={!outpostAffordable}
                  title={`Coût : ${OUTPOST_COST_TEXT}`}
                  onClick={() =>
                    activeColony &&
                    send({ type: "buildOutpost", colonyId: activeColony.id, beltId: belt.id })
                  }
                >
                  Construire un avant-poste
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {activeColony && (
        <p className="small muted">
          Origine des missions : {activeColony.name}. Vaisseau colonial : {SHIP_COST_TEXT}.
        </p>
      )}
    </>
  );
}
