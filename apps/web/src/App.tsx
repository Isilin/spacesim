import {
  allPlanets,
  computeEffects,
  findGalaxyOfSystem,
  gatewayLinks,
  type Colony,
  type Contract,
  type EmpireEffects,
  type Fleet,
  type ForeignStation,
  type GameState,
  type Gateway,
  type Mission,
  type Planet,
  type StarSystem,
  type Station,
  type TechId,
  type Territory,
  type Universe,
} from "@spacesim/shared";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Select, Toast, ToastStack, TopBar } from "@spacesim/ui";
import {
  Navigate,
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
import { StationsView } from "./StationsView.js";
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

interface MapPageProps {
  universe: Universe;
  game: GameState;
  colony: Colony | null;
  colonies: Colony[];
  stations: Station[];
  foreignStations: ForeignStation[];
  missions: Mission[];
  exploredSystemIds: string[];
  gateways: Gateway[];
  contracts: Contract[];
  territories: Territory[];
  fleets: Fleet[];
  effects: EmpireEffects;
  portalLinks: [string, string][];
  now: number;
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
  stations,
  foreignStations,
  missions,
  exploredSystemIds,
  gateways,
  contracts,
  territories,
  fleets,
  effects,
  portalLinks,
  now,
}: MapPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    level,
    galaxy: viewGalaxy,
    system: viewSystem,
    body: viewBody,
  } = useMapLevel(universe);
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
    navigate(
      `/map/galaxy/${galaxy.id}/system/${system.id}${colonyOnlySearch()}`,
    );
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
              ? (allPlanets(universe).find((p) => p.id === colony.planetId)
                  ?.systemId ?? null)
              : null
          }
          onGo={goTo}
        />
        <nav className="breadcrumb">
          <button onClick={() => navigate(`/map${colonyOnlySearch()}`)}>
            Univers
          </button>
          {viewGalaxy && (
            <>
              <span className="muted">/</span>
              <button onClick={() => openGalaxy(viewGalaxy.id)}>
                {viewGalaxy.name}
              </button>
            </>
          )}
          {viewSystem && (
            <>
              <span className="muted">/</span>
              {viewBody ? (
                <button onClick={() => openSystem(viewSystem)}>
                  {viewSystem.name}
                </button>
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
            stations={stations}
            foreignStations={foreignStations}
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
            effects={effects}
            now={now}
            selectedBodyId={focus}
            onSelectBody={(body) => setFocus(body.id)}
            onOpenBody={openBody}
          />
        ) : viewSystem ? (
          <SystemView
            system={viewSystem}
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
            effects={effects}
            portalLinks={portalLinks}
            now={now}
            onOpenBody={openBody}
          />
        ) : focusedSystem ? (
          <>
            <SystemPanel
              system={focusedSystem}
              effects={effects}
              portalLinks={portalLinks}
              now={now}
              onOpenBody={openBody}
            />
            <Button onClick={() => openSystem(focusedSystem)}>
              Ouvrir la vue système
            </Button>
          </>
        ) : level === "universe" ? (
          <GatewaysPanel now={now} />
        ) : (
          <p className="muted">
            Sélectionnez un système (double-clic : vue système).
          </p>
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
    stations,
    foreignStations,
    leaderboard,
    territories,
    objectives,
    worldEvents,
    connected,
    actionError,
    send,
  } = useGameStore();
  const location = useLocation();
  const navigate = useNavigate();
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

  const routeTabs = [
    { value: "colony", label: "Colonie" },
    { value: "stations", label: "Stations" },
    { value: "map", label: "Carte" },
    { value: "logistics", label: "Logistique" },
    {
      value: "fleets",
      label: `Flottes${pirateLairs.length > 0 ? ` (${pirateLairs.length}☠)` : ""}`,
    },
    { value: "shipyard", label: "Chantier" },
    { value: "research", label: "Recherche" },
    { value: "empire", label: "Empire" },
  ].map((t) => ({ ...t, href: `/${t.value}${location.search}` }));
  const activeTab = routeTabs.find((t) =>
    location.pathname.startsWith(`/${t.value}`),
  )?.value;

  return (
    <div className="layout">
      <TopBar
        items={routeTabs}
        active={activeTab}
        onNavChange={(value) =>
          navigate({ pathname: `/${value}`, search: location.search })
        }
        status={{
          label: connected ? "● LIAISON ÉTABLIE" : "○ LIAISON PERDUE",
          tone: connected ? "ok" : "ko",
        }}
      >
        {colonies.length > 1 && (
          <Select
            value={colony?.id ?? ""}
            onChange={(e) => setColonyId(e.target.value)}
            options={colonies.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <Badge variant="violet" title="Influence de l'empire">
          ✦ {Math.floor(game.influence)}
        </Badge>
        <Badge>Tick {game.tick}</Badge>
        <span title={auth.email ?? ""}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              marginRight: 6,
              background: auth.empire?.color ?? "var(--cyan)",
            }}
          />
          {auth.empire?.name ?? "Empire"}
        </span>
        <Button variant="link" onClick={() => void auth.logout()}>
          Déconnexion
        </Button>
      </TopBar>

      {actionError && <Toast variant="error">{actionError}</Toast>}

      {notifications.length > 0 && (
        <ToastStack>
          {notifications.map((n) => (
            <Toast key={n.id}>{n.text}</Toast>
          ))}
        </ToastStack>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <Navigate
              to={{ pathname: "/colony", search: location.search }}
              replace
            />
          }
        />
        <Route
          path="/colony"
          element={
            <main className="content-single">
              <ColonyView effects={effects} />
            </main>
          }
        />
        <Route
          path="/stations"
          element={
            <main className="content-single">
              <StationsView
                effects={effects}
                universe={universe}
                portalLinks={portalLinks}
              />
            </main>
          }
        />
        <Route
          path="/logistics"
          element={
            <main className="content-single">
              <LogisticsView
                effects={effects}
                portalLinks={portalLinks}
                now={now}
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
              <ShipDesigner effects={effects} />
            </main>
          }
        />
        <Route
          path="/research"
          element={
            <main className="content-single">
              <ResearchView
                game={game}
                colonies={colonies}
                now={now}
                send={send}
              />
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
                stations={stations}
                foreignStations={foreignStations}
                missions={missions}
                exploredSystemIds={exploredSystemIds}
                gateways={gateways}
                contracts={contracts}
                territories={territories}
                fleets={fleets}
                effects={effects}
                portalLinks={portalLinks}
                now={now}
              />
            }
          />
        ))}
      </Routes>
    </div>
  );
}
