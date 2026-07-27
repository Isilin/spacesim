import {
  allPlanets,
  computeEffects,
  findGalaxyOfSystem,
  gatewayLinks,
  type Colony,
  type Contract,
  type EmpireEffects,
  type Fleet,
  type GameState,
  type Gateway,
  type MiningOutpost,
  type Mission,
  type Planet,
  type Route as GameRoute,
  type StarSystem,
  type StationMarket,
  type TechId,
  type Territory,
  type Universe,
} from "@spacesim/shared";
import type { ClientMessage } from "@spacesim/protocol";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { BodyView } from "./BodyView.js";
import { ColonyView } from "./ColonyView.js";
import { EmpireView } from "./EmpireView.js";
import { GalaxyMap } from "./GalaxyMap.js";
import { FleetsView } from "./FleetsView.js";
import { ShipDesigner } from "./ShipDesigner.js";
import { GatewaysPanel } from "./GatewaysPanel.js";
import { useMapLevel } from "./hooks/useMapLevel.js";
import { MapNav, type NavTarget } from "./MapNav.js";
import { ResearchView } from "./ResearchView.js";
import { LogisticsView } from "./LogisticsView.js";
import { SystemPanel } from "./SystemPanel.js";
import { SystemView } from "./SystemView.js";
import { UniverseMap } from "./UniverseMap.js";
import { useGameConnection } from "./hooks/useGameConnection.js";
import { useGameStore } from "./state/game-store.js";
import { useNotifications } from "./useNotifications.js";
import type { Auth } from "./useAuth.js";

interface Props {
  /** Session validée par `AuthGate` : `token` est garanti non nul ici. */
  auth: Auth;
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

/** Onglet de la barre de navigation : conserve la recherche courante (`?colony=…`). */
function TabLink({ to, children }: { to: string; children: ReactNode }) {
  const location = useLocation();
  return (
    <NavLink to={{ pathname: to, search: location.search }} className={navLinkClass}>
      {children}
    </NavLink>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "active" : "";
}

interface MapPageProps {
  universe: Universe;
  game: GameState;
  colony: Colony | null;
  colonies: Colony[];
  missions: Mission[];
  exploredSystemIds: string[];
  markets: StationMarket[];
  routes: GameRoute[];
  outposts: MiningOutpost[];
  gateways: Gateway[];
  contracts: Contract[];
  territories: Territory[];
  fleets: Fleet[];
  blueprints: import("@spacesim/shared").Blueprint[];
  effects: EmpireEffects;
  portalLinks: [string, string][];
  now: number;
  send: (msg: ClientMessage) => void;
}

/**
 * Onglet carte : univers → galaxie → système → corps (chantier 9.4), porté par les routes
 * imbriquées `/map/galaxy/:galaxyId/system/:systemId/body/:bodyId` plutôt qu'un historique
 * maison — `navigate()` remplace `pushView`, l'historique du navigateur fait foi.
 */
function MapPage({
  universe,
  game,
  colony,
  colonies,
  missions,
  exploredSystemIds,
  markets,
  routes,
  outposts,
  gateways,
  contracts,
  territories,
  fleets,
  blueprints,
  effects,
  portalLinks,
  now,
  send,
}: MapPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { level, galaxy: viewGalaxy, system: viewSystem, body: viewBody } = useMapLevel(universe);
  const focus = searchParams.get("focus");

  /** Sélection secondaire (survol/clic sans ouvrir) : un id par niveau, jamais empilé. */
  const setFocus = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("focus", id);
    else next.delete("focus");
    setSearchParams(next, { replace: true });
  };

  /** Recherche courante sans `focus` : un changement de niveau repart d'une sélection propre. */
  const colonyOnlySearch = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    const s = next.toString();
    return s ? `?${s}` : "";
  };

  const openGalaxy = (galaxyId: string) => {
    navigate(`/map/galaxy/${galaxyId}${colonyOnlySearch()}`);
  };

  const openSystem = (system: StarSystem) => {
    const galaxy = findGalaxyOfSystem(universe, system.id);
    if (!galaxy) return;
    navigate(`/map/galaxy/${galaxy.id}/system/${system.id}${colonyOnlySearch()}`);
  };

  /** Ouvre la fiche d'un corps (chantier 10) : niveau de carte à part entière. */
  const openBody = (planet: Planet) => {
    const galaxy = findGalaxyOfSystem(universe, planet.systemId);
    if (!galaxy) return;
    navigate(
      `/map/galaxy/${galaxy.id}/system/${planet.systemId}/body/${planet.id}${colonyOnlySearch()}`,
    );
  };

  /** Saut direct depuis la recherche ou un raccourci (chantier 9.7). */
  const goTo = (target: NavTarget) => {
    if (target.kind === "universe") {
      navigate(`/map${colonyOnlySearch()}`);
      return;
    }
    if (target.kind === "galaxy") {
      openGalaxy(target.galaxyId);
      return;
    }
    const system = universe.galaxies
      .find((g) => g.id === target.galaxyId)
      ?.systems.find((candidate) => candidate.id === target.systemId);
    if (system) openSystem(system);
  };

  const fleetSystemIds = fleets.map((f) => f.systemId);
  // Système « survolé » à ce niveau (chantier 9.4) : affiché dans le panneau latéral avec
  // un bouton d'ouverture, sans quitter la vue galaxie.
  const focusedSystem =
    level === "galaxy" && viewGalaxy && focus
      ? (viewGalaxy.systems.find((s) => s.id === focus) ?? null)
      : null;

  return (
    <main className="content">
      <section className="map-panel">
        <MapNav
          universe={universe}
          colonies={colonies}
          exploredSystemIds={exploredSystemIds}
          fleetSystemIds={fleetSystemIds}
          homeSystemId={
            colony
              ? (allPlanets(universe).find((p) => p.id === colony.planetId)?.systemId ?? null)
              : null
          }
          onGo={goTo}
        />
        <nav className="breadcrumb">
          <button onClick={() => navigate(`/map${colonyOnlySearch()}`)}>Univers</button>
          {viewGalaxy && (
            <>
              <span className="muted">/</span>
              <button onClick={() => openGalaxy(viewGalaxy.id)}>{viewGalaxy.name}</button>
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
        {level === "universe" ? (
          <UniverseMap
            universe={universe}
            colonies={colonies}
            exploredSystemIds={exploredSystemIds}
            gateways={gateways}
            contracts={contracts}
            selectedId={focus}
            onSelect={(g) => setFocus(g.id)}
            onOpenGalaxy={(g) => openGalaxy(g.id)}
          />
        ) : level === "galaxy" && viewGalaxy ? (
          <GalaxyMap
            galaxy={viewGalaxy}
            colonies={colonies}
            missions={missions}
            exploredSystemIds={exploredSystemIds}
            claimedSystemIds={game.claimedSystemIds}
            territories={territories}
            selectedId={focus}
            onSelect={(s) => setFocus(s.id)}
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
            selectedBodyId={focus}
            onSelectBody={(body) => setFocus(body.id)}
            onOpenBody={openBody}
          />
        ) : viewSystem ? (
          <SystemView
            system={viewSystem}
            colonies={colonies}
            explored={exploredSystemIds.includes(viewSystem.id)}
            selectedBodyId={focus}
            onSelectBody={(body) => setFocus(body.id)}
            onOpenBody={openBody}
          />
        ) : null}
      </section>
      <aside className="side-panel">
        {(level === "system" || level === "body") && viewSystem ? (
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
            blueprints={blueprints}
            portalLinks={portalLinks}
            now={now}
            send={send}
            onOpenBody={openBody}
          />
        ) : focusedSystem ? (
          <>
            <SystemPanel
              system={focusedSystem}
              colonies={colonies}
              missions={missions}
              explored={exploredSystemIds.includes(focusedSystem.id)}
              activeColony={colony}
              effects={effects}
              markets={markets}
              universe={universe}
              outposts={outposts}
              game={game}
              routes={routes}
              blueprints={blueprints}
              portalLinks={portalLinks}
              now={now}
              send={send}
              onOpenBody={openBody}
            />
            <button className="action-button" onClick={() => openSystem(focusedSystem)}>
              Ouvrir la vue système
            </button>
          </>
        ) : level === "universe" ? (
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
          <p className="muted">Sélectionnez un système (double-clic : vue système).</p>
        )}
      </aside>
    </main>
  );
}

export function App({ auth }: Props) {
  useGameConnection(auth.token!, auth.sessionExpired);
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
    blueprints,
    pirateLairs,
    battles,
    foreignFleets,
    foreignColonies,
    leaderboard,
    territories,
    objectives,
    worldEvents,
    connected,
    actionError,
    send,
  } = useGameStore();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const colonyId = searchParams.get("colony");
  const setColonyId = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("colony", id);
    setSearchParams(next, { replace: true });
  };
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

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">SPACESIM</span>
        <nav className="tabs">
          <TabLink to="/colony">Colonie</TabLink>
          <TabLink to="/map">Carte</TabLink>
          <TabLink to="/logistics">Logistique</TabLink>
          <TabLink to="/fleets">
            Flottes{pirateLairs.length > 0 ? ` (${pirateLairs.length}☠)` : ""}
          </TabLink>
          <TabLink to="/shipyard">Chantier</TabLink>
          <TabLink to="/research">Recherche</TabLink>
          <TabLink to="/empire">Empire</TabLink>
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

      <Routes>
        <Route
          path="/"
          element={<Navigate to={{ pathname: "/colony", search: location.search }} replace />}
        />
        <Route
          path="/colony"
          element={
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
          }
        />
        <Route
          path="/logistics"
          element={
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
          }
        />
        <Route
          path="/fleets"
          element={
            <main className="content-single">
              <FleetsView
                fleets={fleets}
                pirateLairs={pirateLairs}
                battles={battles}
                colonies={colonies}
                blueprints={blueprints}
                foreignFleets={foreignFleets}
                foreignColonies={foreignColonies}
                universe={universe}
                researched={game.researched}
                now={now}
                send={send}
              />
            </main>
          }
        />
        <Route
          path="/shipyard"
          element={
            <main className="content-single">
              <ShipDesigner
                blueprints={blueprints}
                effects={effects}
                activeColony={colony}
                fleets={fleets}
                send={send}
              />
            </main>
          }
        />
        <Route
          path="/research"
          element={
            <main className="content-single">
              <ResearchView game={game} colonies={colonies} now={now} send={send} />
            </main>
          }
        />
        <Route
          path="/empire"
          element={
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
                objectives={objectives}
                worldEvents={worldEvents}
                pirateLairs={pirateLairs}
                playerId={playerId}
                effects={effects}
                now={now}
                send={send}
              />
            </main>
          }
        />
        {[
          "/map",
          "/map/galaxy/:galaxyId",
          "/map/galaxy/:galaxyId/system/:systemId",
          "/map/galaxy/:galaxyId/system/:systemId/body/:bodyId",
        ].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <MapPage
                universe={universe}
                game={game}
                colony={colony}
                colonies={colonies}
                missions={missions}
                exploredSystemIds={exploredSystemIds}
                markets={markets}
                routes={routes}
                outposts={outposts}
                gateways={gateways}
                contracts={contracts}
                territories={territories}
                fleets={fleets}
                blueprints={blueprints}
                effects={effects}
                portalLinks={portalLinks}
                now={now}
                send={send}
              />
            }
          />
        ))}
      </Routes>
    </div>
  );
}
