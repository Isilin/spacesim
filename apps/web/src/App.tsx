import {
  allPlanets,
  allSystems,
  computeEffects,
  findGalaxyOfSystem,
  gatewayLinks,
  type Planet,
  type StarSystem,
  type TechId,
} from "@spacesim/shared";
import { useEffect, useMemo, useState } from "react";
import { BodyView } from "./BodyView.js";
import { ColonyView } from "./ColonyView.js";
import { EmpireView } from "./EmpireView.js";
import { GalaxyMap } from "./GalaxyMap.js";
import { FleetsView } from "./FleetsView.js";
import { GatewaysPanel } from "./GatewaysPanel.js";
import { MapNav, type NavTarget } from "./MapNav.js";
import { ResearchView } from "./ResearchView.js";
import { LogisticsView } from "./LogisticsView.js";
import { SystemPanel } from "./SystemPanel.js";
import { SystemView } from "./SystemView.js";
import { UniverseMap } from "./UniverseMap.js";
import { useGameSocket } from "./useGameSocket.js";
import { useNotifications } from "./useNotifications.js";
import type { Auth } from "./useAuth.js";

interface Props {
  /** Session validée par `AuthGate` : `token` est garanti non nul ici. */
  auth: Auth;
}

type Tab = "map" | "colony" | "logistics" | "fleets" | "research" | "empire";

/** Niveau de zoom de la carte : univers → galaxie → système → corps. */
type MapView =
  | { level: "universe" }
  | { level: "galaxy"; galaxyId: string }
  | { level: "system"; galaxyId: string; systemId: string }
  | { level: "body"; galaxyId: string; systemId: string; bodyId: string };

/**
 * Historique de navigation de la carte (chantier 9.7) : `entries[cursor]` est la vue
 * courante ; naviguer tronque le futur, comme un historique de navigateur.
 */
interface MapHistory {
  entries: MapView[];
  cursor: number;
}

const EMPTY_HISTORY: MapHistory = { entries: [], cursor: -1 };

function pushView(history: MapHistory, view: MapView): MapHistory {
  const entries = [...history.entries.slice(0, history.cursor + 1), view];
  return { entries, cursor: entries.length - 1 };
}

/** Horloge locale pour les comptes à rebours (les timers font foi côté serveur). */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function App({ auth }: Props) {
  const {
    playerId,
    universe,
    game,
    colonies,
    transfers,
    missions,
    exploredSystemIds,
    markets,
    routes,
    outposts,
    gateways,
    contracts,
    factionStates,
    proposals,
    fleets,
    pirateLairs,
    battles,
    foreignFleets,
    foreignColonies,
    leaderboard,
    territories,
    connected,
    actionError,
    send,
  } = useGameSocket(auth.token!, auth.sessionExpired);
  const [tab, setTab] = useState<Tab>("colony");
  const [colonyId, setColonyId] = useState<string | null>(null);
  const [history, setHistory] = useState<MapHistory>(EMPTY_HISTORY);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const now = useNow();
  const effects = useMemo(
    () => computeEffects((game?.researched ?? []) as TechId[]),
    [game?.researched],
  );
  const portalLinks = useMemo(
    () => (universe ? gatewayLinks(universe, gateways) : []),
    [universe, gateways],
  );
  const notifications = useNotifications({
    game,
    colonies,
    transfers,
    missions,
    exploredSystemIds,
    universe,
    battleCount: battles.length,
  });

  if (!universe || !game) {
    return <div className="loading">Connexion au serveur…</div>;
  }

  const colony = colonies.find((c) => c.id === colonyId) ?? colonies[0] ?? null;
  const colonyPlanet = colony
    ? allPlanets(universe).find((p) => p.id === colony.planetId)
    : undefined;

  // Vue par défaut : la galaxie de la colonie active.
  const homeGalaxy = colonyPlanet
    ? findGalaxyOfSystem(universe, colonyPlanet.systemId)
    : universe.galaxies[0];
  const mapView = history.entries[history.cursor] ?? null;
  const view: MapView = mapView ?? { level: "galaxy", galaxyId: homeGalaxy?.id ?? "gal-0" };
  const setMapView = (next: MapView) => setHistory((h) => pushView(h, next));

  const viewGalaxy =
    view.level !== "universe"
      ? universe.galaxies.find((g) => g.id === view.galaxyId) ?? universe.galaxies[0]!
      : null;
  const viewSystem =
    (view.level === "system" || view.level === "body") && viewGalaxy
      ? viewGalaxy.systems.find((s) => s.id === view.systemId) ?? null
      : null;
  const viewBody =
    view.level === "body" && viewSystem
      ? viewSystem.planets.find((p) => p.id === view.bodyId) ?? null
      : null;
  const selectedSystem = selectedSystemId
    ? allSystems(universe).find((s) => s.id === selectedSystemId) ?? null
    : null;

  const openSystem = (system: StarSystem) => {
    const galaxy = findGalaxyOfSystem(universe, system.id);
    if (!galaxy) return;
    setMapView({ level: "system", galaxyId: galaxy.id, systemId: system.id });
    setSelectedSystemId(system.id);
    setSelectedBodyId(null);
  };

  /** Ouvre la fiche d'un corps (chantier 10) : niveau de carte à part entière. */
  const openBody = (planet: Planet) => {
    const galaxy = findGalaxyOfSystem(universe, planet.systemId);
    if (!galaxy) return;
    setMapView({
      level: "body",
      galaxyId: galaxy.id,
      systemId: planet.systemId,
      bodyId: planet.id,
    });
    setSelectedSystemId(planet.systemId);
    setSelectedBodyId(planet.id);
  };

  /** Saut direct depuis la recherche ou un raccourci (chantier 9.7). */
  const goTo = (target: NavTarget) => {
    if (target.kind === "universe") {
      setMapView({ level: "universe" });
      return;
    }
    if (target.kind === "galaxy") {
      setMapView({ level: "galaxy", galaxyId: target.galaxyId });
      return;
    }
    setMapView({ level: "system", galaxyId: target.galaxyId, systemId: target.systemId });
    setSelectedSystemId(target.systemId);
    setSelectedBodyId(null);
  };

  const fleetSystemIds = fleets.map((f) => f.systemId);

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">SPACESIM</span>
        <nav className="tabs">
          <button className={tab === "colony" ? "active" : ""} onClick={() => setTab("colony")}>
            Colonie
          </button>
          <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>
            Carte
          </button>
          <button
            className={tab === "logistics" ? "active" : ""}
            onClick={() => setTab("logistics")}
          >
            Logistique
          </button>
          <button className={tab === "fleets" ? "active" : ""} onClick={() => setTab("fleets")}>
            Flottes{pirateLairs.length > 0 ? ` (${pirateLairs.length}☠)` : ""}
          </button>
          <button
            className={tab === "research" ? "active" : ""}
            onClick={() => setTab("research")}
          >
            Recherche
          </button>
          <button className={tab === "empire" ? "active" : ""} onClick={() => setTab("empire")}>
            Empire
          </button>
        </nav>
        {colonies.length > 1 && (
          <select
            className="colony-select"
            value={colony?.id ?? ""}
            onChange={(e) => setColonyId(e.target.value)}
          >
            {colonies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <span className="stat influence" title="Influence de l'empire">
          ✦ {Math.floor(game.influence)}
        </span>
        <span className="stat">Tick {game.tick}</span>
        <span className={`stat ${connected ? "ok" : "ko"}`}>
          {connected ? "● LIAISON ÉTABLIE" : "○ LIAISON PERDUE"}
        </span>
        <span className="stat empire-badge" title={auth.email ?? ""}>
          <span
            className="empire-dot"
            style={{ background: auth.empire?.color ?? "var(--accent)" }}
          />
          {auth.empire?.name ?? "Empire"}
        </span>
        <button className="link-button" onClick={() => void auth.logout()}>
          Déconnexion
        </button>
      </header>

      {actionError && <div className="toast-error">{actionError}</div>}

      {notifications.length > 0 && (
        <div className="toast-stack">
          {notifications.map((n) => (
            <div key={n.id} className="toast-info">
              {n.text}
            </div>
          ))}
        </div>
      )}

      {tab === "colony" ? (
        <main className="content-single">
          {colony && colonyPlanet ? (
            <ColonyView
              colony={colony}
              planet={colonyPlanet}
              colonies={colonies}
              transfers={transfers}
              universe={universe}
              effects={effects}
              routes={routes}
              researched={game.researched}
              portalLinks={portalLinks}
              send={send}
            />
          ) : (
            <p className="muted">Aucune colonie.</p>
          )}
        </main>
      ) : tab === "logistics" ? (
        <main className="content-single">
          <LogisticsView
            routes={routes}
            colonies={colonies}
            colony={colony}
            transfers={transfers}
            universe={universe}
            exploredSystemIds={exploredSystemIds}
            outposts={outposts}
            markets={markets}
            contracts={contracts}
            playerId={playerId}
            effects={effects}
            portalLinks={portalLinks}
            now={now}
            send={send}
          />
        </main>
      ) : tab === "fleets" ? (
        <main className="content-single">
          <FleetsView
            fleets={fleets}
            pirateLairs={pirateLairs}
            battles={battles}
            colonies={colonies}
            foreignFleets={foreignFleets}
            foreignColonies={foreignColonies}
            universe={universe}
            researched={game.researched}
            now={now}
            send={send}
          />
        </main>
      ) : tab === "research" ? (
        <main className="content-single">
          <ResearchView game={game} colonies={colonies} now={now} send={send} />
        </main>
      ) : tab === "empire" ? (
        <main className="content-single">
          <EmpireView
            game={game}
            colonies={colonies}
            universe={universe}
            exploredSystemIds={exploredSystemIds}
            leaderboard={leaderboard}
            factionStates={factionStates}
            contracts={contracts}
            proposals={proposals}
            playerId={playerId}
            effects={effects}
            send={send}
          />
        </main>
      ) : (
        <main className="content">
          <section className="map-panel">
            <MapNav
              universe={universe}
              colonies={colonies}
              exploredSystemIds={exploredSystemIds}
              fleetSystemIds={fleetSystemIds}
              homeSystemId={colonyPlanet?.systemId ?? null}
              canGoBack={history.cursor > 0}
              canGoForward={history.cursor < history.entries.length - 1}
              onBack={() => setHistory((h) => ({ ...h, cursor: Math.max(0, h.cursor - 1) }))}
              onForward={() =>
                setHistory((h) => ({
                  ...h,
                  cursor: Math.min(h.entries.length - 1, h.cursor + 1),
                }))
              }
              onGo={goTo}
            />
            <nav className="breadcrumb">
              <button onClick={() => setMapView({ level: "universe" })}>Univers</button>
              {viewGalaxy && (
                <>
                  <span className="muted">/</span>
                  <button
                    onClick={() => setMapView({ level: "galaxy", galaxyId: viewGalaxy.id })}
                  >
                    {viewGalaxy.name}
                  </button>
                </>
              )}
              {viewSystem && (
                <>
                  <span className="muted">/</span>
                  {viewBody ? (
                    <button onClick={() => openSystem(viewSystem)}>{viewSystem.name}</button>
                  ) : (
                    <span className="breadcrumb-current">{viewSystem.name}</span>
                  )}
                </>
              )}
              {viewBody && (
                <>
                  <span className="muted">/</span>
                  <span className="breadcrumb-current">{viewBody.name}</span>
                </>
              )}
            </nav>
            {view.level === "universe" ? (
              <UniverseMap
                universe={universe}
                colonies={colonies}
                exploredSystemIds={exploredSystemIds}
                gateways={gateways}
                onSelect={(galaxy) => setMapView({ level: "galaxy", galaxyId: galaxy.id })}
              />
            ) : view.level === "galaxy" && viewGalaxy ? (
              <GalaxyMap
                galaxy={viewGalaxy}
                colonies={colonies}
                missions={missions}
                exploredSystemIds={exploredSystemIds}
                claimedSystemIds={game.claimedSystemIds}
                territories={territories}
                selectedId={selectedSystemId}
                onSelect={(s) => setSelectedSystemId(s.id)}
                onOpenSystem={openSystem}
              />
            ) : viewBody && viewSystem ? (
              <BodyView
                system={viewSystem}
                body={viewBody}
                colonies={colonies}
                missions={missions}
                activeColony={colony}
                effects={effects}
                game={game}
                explored={exploredSystemIds.includes(viewSystem.id)}
                now={now}
                send={send}
                onOpenBody={openBody}
              />
            ) : viewSystem ? (
              <SystemView
                system={viewSystem}
                colonies={colonies}
                explored={exploredSystemIds.includes(viewSystem.id)}
                selectedBodyId={selectedBodyId}
                onSelectBody={openBody}
              />
            ) : null}
          </section>
          <aside className="side-panel">
            {(view.level === "system" || view.level === "body") && viewSystem ? (
              <SystemPanel
                system={viewSystem}
                colonies={colonies}
                missions={missions}
                explored={exploredSystemIds.includes(viewSystem.id)}
                activeColony={colony}
                effects={effects}
                markets={markets}
                universe={universe}
                outposts={outposts}
                game={game}
                routes={routes}
                portalLinks={portalLinks}
                now={now}
                send={send}
                onOpenBody={openBody}
              />
            ) : selectedSystem ? (
              <>
                <SystemPanel
                  system={selectedSystem}
                  colonies={colonies}
                  missions={missions}
                  explored={exploredSystemIds.includes(selectedSystem.id)}
                  activeColony={colony}
                  effects={effects}
                  markets={markets}
                  universe={universe}
                  outposts={outposts}
                  game={game}
                  routes={routes}
                  portalLinks={portalLinks}
                  now={now}
                  send={send}
                  onOpenBody={openBody}
                />
                <button className="action-button" onClick={() => openSystem(selectedSystem)}>
                  Ouvrir la vue système
                </button>
              </>
            ) : view.level === "universe" ? (
              <GatewaysPanel
                gateways={gateways}
                universe={universe}
                activeColony={colony}
                routes={routes}
                researched={game.researched}
                now={now}
                send={send}
              />
            ) : (
              <p className="muted">
                Sélectionnez un système (double-clic : vue système).
              </p>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}
