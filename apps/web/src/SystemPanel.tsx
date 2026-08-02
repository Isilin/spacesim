import {
  CLAIM_COST,
  OUTPOST_COST,
  OUTPOST_STOCK_CAP,
  PROBE_COST_CREDITS,
  type EmpireEffects,
  type Planet,
  type ResourceId,
  type StarSystem,
} from "@spacesim/shared";
import { useSearchParams } from "react-router-dom";
import { Button, Panel } from "@spacesim/ui";
import { BodyActions, COLONY_SHIP_COST_TEXT } from "./BodyActions.js";
import { formatDuration } from "./format.js";
import { PLANET_TYPE_LABELS, RESOURCE_LABELS } from "./labels.js";
import { TradingPostPanel } from "./TradingPostPanel.js";
import { useGameStore } from "./state/game-store.js";
import { selectActiveColony, selectExplored } from "./state/selectors.js";

interface Props {
  system: StarSystem;
  effects: EmpireEffects;
  portalLinks: [string, string][];
  now: number;
  /** Ouvre la fiche détaillée d'un corps (chantier 10). */
  onOpenBody?: (body: Planet) => void;
}

const OUTPOST_COST_TEXT = Object.entries(OUTPOST_COST)
  .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
  .join(" · ");

export function SystemPanel({ system, effects, portalLinks, now, onOpenBody }: Props) {
  const [searchParams] = useSearchParams();
  const activeColony = useGameStore(selectActiveColony(searchParams.get("colony")));
  const explored = useGameStore(selectExplored(system.id));
  const {
    colonies,
    missions,
    markets,
    universe,
    outposts,
    stations,
    game,
    routes,
    blueprints,
    send,
  } = useGameStore();
  const probeMission = missions.find((m) => m.kind === "probe" && m.targetId === system.id);
  const probeCost = Math.round(PROBE_COST_CREDITS * effects.probeCostMult);

  if (!universe || !game) return null;

  if (!explored) {
    return (
      <Panel title={system.name}>
        <p className="muted">Système non exploré.</p>
        {probeMission ? (
          <p className="small ok">
            Sonde en route — {formatDuration(probeMission.arrivesAt - now)}
          </p>
        ) : (
          <Button
            disabled={!activeColony || activeColony.resources.credits < probeCost}
            onClick={() =>
              activeColony &&
              send({ type: "probe", colonyId: activeColony.id, systemId: system.id })
            }
          >
            Sonder ({probeCost} crédits)
          </Button>
        )}
      </Panel>
    );
  }

  /**
   * Ligne compacte : l'essentiel pour choisir, le détail complet vit dans la vue corps
   * (chantier 10). Cliquer la ligne ouvre cette vue.
   */
  const renderBody = (p: (typeof system.planets)[number]) => {
    return (
      <li
        key={p.id}
        className={`planet body-row ${p.kind === "moon" ? "moon-row" : ""}`}
        onClick={() => onOpenBody?.(p)}
      >
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
          {Object.keys(p.deposits).length > 0 && (
            <span className="muted">
              {Object.entries(p.deposits)
                .map(([res, mod]) => `${RESOURCE_LABELS[res as ResourceId]} ×${mod}`)
                .join(" · ")}
            </span>
          )}
        </div>
        <BodyActions
          body={p}
          colonies={colonies}
          missions={missions}
          activeColony={activeColony}
          game={game}
          effects={effects}
          stations={stations}
          now={now}
          send={send}
        />
      </li>
    );
  };

  const planets = system.planets.filter((p) => p.kind === "planet");
  const moonCount = system.planets.length - planets.length;

  const claimed = game.claimedSystemIds.includes(system.id);
  const hasOwnColony = colonies.some((c) => system.planets.some((p) => p.id === c.planetId));

  return (
    <>
      <Panel title={system.name}>
        <p className="muted">
          {planets.length} planètes
          {moonCount > 0 ? `, ${moonCount} lunes` : ""}
          {system.belts.length > 0 ? `, ${system.belts.length} ceintures` : ""}
          {system.station ? ", 1 comptoir" : ""}
        </p>
        {claimed ? (
          <p className="small claim-badge">
            ✦ Système revendiqué — production +15 %{" "}
            <Button onClick={() => send({ type: "unclaimSystem", systemId: system.id })}>
              Abandonner
            </Button>
          </p>
        ) : hasOwnColony ? (
          <Button
            disabled={game.influence < CLAIM_COST}
            title={game.influence < CLAIM_COST ? "Influence insuffisante" : ""}
            onClick={() => send({ type: "claimSystem", systemId: system.id })}
          >
            Revendiquer le système ({CLAIM_COST} ✦)
          </Button>
        ) : null}
        <ul className="planet-list">
          {planets.flatMap((p) => [
            renderBody(p),
            ...system.planets
              .filter((m) => m.kind === "moon" && m.parentPlanetId === p.id)
              .map(renderBody),
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
                    Chantier en route — {formatDuration(buildMission.arrivesAt - now)}
                  </p>
                ) : (
                  <Button
                    disabled={!outpostAffordable}
                    title={`Coût : ${OUTPOST_COST_TEXT}`}
                    onClick={() =>
                      activeColony &&
                      send({ type: "buildOutpost", colonyId: activeColony.id, beltId: belt.id })
                    }
                  >
                    Construire un avant-poste
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {activeColony && (
          <p className="small muted">
            Origine des missions : {activeColony.name}. Vaisseau colonial : {COLONY_SHIP_COST_TEXT}.
          </p>
        )}
      </Panel>
      {system.station && (
        <TradingPostPanel
          tradingPost={system.station}
          market={markets.find((m) => m.tradingPostId === system.station!.id)}
          activeColony={activeColony}
          missions={missions}
          universe={universe}
          transferSpeedMult={effects.transferSpeedMult}
          factionRep={game.factionRep}
          routes={routes}
          blueprints={blueprints}
          portalLinks={portalLinks}
          now={now}
          send={send}
        />
      )}
    </>
  );
}
