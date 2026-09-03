import {
  allPlanets,
  computeEffects,
  gatewayLinks,
  type Colony,
  type Contract,
  type EmpireEffects,
  type Fleet,
  type ForeignFleet,
  type ForeignStation,
  type GameState,
  type MiningOutpost,
  type Gateway,
  type Mission,
  type Station,
  type SystemSite,
  type TechId,
  type Territory,
  type ClientUniverse,
} from "@spacesim/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Select, Toast, ToastStack, TopBar } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ColonyView } from "./ColonyView.js";
import { EmpireView } from "./EmpireView.js";
import { CommunicationView } from "./CommunicationView.js";
import { CorporationView } from "./CorporationView.js";
import { InboxView } from "./InboxView.js";
import { FleetsView } from "./FleetsView.js";
import { ShipDesigner } from "./ShipDesigner.js";
import { GatewaysPanel } from "./GatewaysPanel.js";
import { MapSheet } from "./MapSheet.js";
import { useMapView } from "./hooks/useMapView.js";
import { MapNav, type NavTarget } from "./MapNav.js";
import { ResearchView } from "./ResearchView.js";
import { LogisticsView } from "./LogisticsView.js";
import { StationsView } from "./StationsView.js";
import { SystemPanel } from "./SystemPanel.js";
import { MapScene } from "./map3d/MapScene.js";
import { useGameConnection } from "./hooks/useGameConnection.js";
import { buildUniverseIndex } from "./state/selectors.js";
import { useGameStore } from "./state/game-store.js";
import { useNotifications } from "./useNotifications.js";
import type { Auth } from "./useAuth.js";

interface Props {
  /** Session validée par `AuthGate` : `token` est garanti non nul ici. */
  auth: Auth;
}

/**
 * Paramètres de requête qui suivent le joueur d'un onglet à l'autre (chantier 35.3).
 *
 * Seul `?colony=` a un sens partout. La carte publie désormais l'état de sa caméra —
 * `?at=`, `?z=`, `?open=` — et le propager tel quel emportait la position de la caméra
 * jusque dans le journal ou la recherche, où elle ne veut rien dire.
 */
function sharedSearch(search: string): string {
  const from = new URLSearchParams(search);
  const kept = new URLSearchParams();
  const colony = from.get("colony");
  if (colony) kept.set("colony", colony);
  const out = kept.toString();
  return out ? `?${out}` : "";
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
  universe: ClientUniverse;
  game: GameState;
  colony: Colony | null;
  colonies: Colony[];
  stations: Station[];
  foreignStations: ForeignStation[];
  outposts: MiningOutpost[];
  foreignFleets: ForeignFleet[];
  missions: Mission[];
  exploredSystemIds: string[];
  /** Sites révélés par les scans (chantier 31.11), rendus dans la vue système. */
  sites: SystemSite[];
  gateways: Gateway[];
  contracts: Contract[];
  territories: Territory[];
  fleets: Fleet[];
  effects: EmpireEffects;
  portalLinks: [string, string][];
  now: number;
}

/**
 * Onglet carte (chantiers 9.4 puis 35.3).
 *
 * Il n'y a plus quatre niveaux mais une seule carte, traversée en continu à la molette.
 * L'URL ne décrit donc plus une hiérarchie de segments mais l'état réel de la caméra :
 * `?at=` ce qu'elle vise, `?z=` à quelle profondeur, `?open=` la fiche ouverte. Un chemin
 * ne sait pas dire « à mi-chemin entre la galaxie et le système ».
 */
function MapPage({
  universe,
  game,
  colony,
  colonies,
  stations,
  foreignStations,
  outposts,
  foreignFleets,
  missions,
  exploredSystemIds,
  sites,
  gateways,
  contracts,
  territories,
  fleets,
  effects,
  portalLinks,
  now,
}: MapPageProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { anchor, depth, open } = useMapView(universe);

  /** Sélection courante : ce que l'infobox montrera (chantier 35.5), pas encore l'URL. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Intention de saut, distincte de l'état de caméra que la carte publie elle-même. */
  const [jumpTo, setJumpTo] = useState<{
    id: string | null;
    token: number;
  } | null>(null);

  /**
   * Échap referme l'infobox (chantier 35.12).
   *
   * `Popover` sait déjà se fermer sur Échap, mais par un `onKeyDown` posé sur son propre
   * nœud : il ne se déclenche que si le focus est dedans. Or l'infobox est montée avec
   * `autoFocus={false}` — le prendre retirerait au joueur les raccourcis de caméra. La
   * touche n'atteignait donc jamais rien, et le clavier n'avait aucun moyen de refermer ce
   * qu'il venait d'ouvrir depuis la liste. Sur le document, faute d'un nœud focusé à qui
   * la confier.
   */
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const index = useMemo(() => buildUniverseIndex(universe), [universe]);

  /**
   * Écriture de l'URL en `replace` : la caméra bouge en continu et chaque position
   * n'est pas une étape de navigation. Seuls les sauts explicites méritent une entrée
   * d'historique, et ils passent par `goTo`.
   */
  const writeView = useCallback(
    (next: URLSearchParams, push = false) =>
      setSearchParams(next, { replace: !push }),
    [setSearchParams],
  );

  /**
   * Suit la caméra dans l'URL. **Ne supprime jamais** ce qu'elle vise : seul un geste
   * explicite le fait, par `goTo`.
   *
   * La carte publie sa position en continu et se trouve, l'instant d'un vol, encore au
   * palier de départ où elle ne vise rien. Publier cette absence effaçait l'ancre que le
   * raccourci venait d'écrire, et le vol partait vers une cible que l'URL ne nommait plus.
   */
  const onViewChange = useCallback(
    (at: string | null, viewDepth: number) => {
      const next = new URLSearchParams(searchParams);
      if (at) next.set("at", at);
      // Une profondeur seule ne décrit aucune vue : sans cible, rien à écrire.
      if (!next.get("at")) return;
      next.set("z", viewDepth.toFixed(2));
      if (next.toString() === searchParams.toString()) return;
      writeView(next);
    },
    [searchParams, writeView],
  );

  /**
   * Ouvre la fiche complète d'un élément dans la modale.
   *
   * La sélection est effacée au passage : l'infobox et la fiche décriraient le même objet
   * en même temps, l'une derrière l'autre.
   */
  const openSheet = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("open", id);
    else next.delete("open");
    setSelectedId(null);
    writeView(next, true);
  };

  /**
   * Saut direct depuis la recherche ou un raccourci (chantier 9.7).
   *
   * Le jeton est ce qui distingue un saut voulu d'une simple écriture d'URL par la carte
   * elle-même : celle-ci publie sa position en continu, et déduire une intention de
   * navigation d'un changement d'URL faisait boucler les deux sens l'un sur l'autre.
   */
  const goTo = (target: NavTarget) => {
    const id = target.kind === "universe" ? null : target.id;
    const next = new URLSearchParams(searchParams);
    if (id) next.set("at", id);
    else next.delete("at");
    next.delete("z");
    next.delete("open");
    writeView(next, true);
    setJumpTo({ id, token: Date.now() });
  };

  const fleetSystemIds = fleets.map((f) => f.systemId);

  /**
   * Système dont le panneau latéral parle : celui de la sélection s'il y en a une, sinon
   * celui que la caméra vise. Cherché par l'index et non par un balayage : la sélection
   * peut désigner n'importe quel objet de l'univers.
   */
  const shownSystemId =
    (selectedId ? index.get(selectedId)?.systemId : null) ?? anchor.systemId;
  const shownSystem = shownSystemId
    ? (universe.galaxies
        .find((g) => g.id === index.get(shownSystemId)?.galaxyId)
        ?.systems.find((s) => s.id === shownSystemId) ?? null)
    : null;

  const openPath = open ? index.get(open) : undefined;
  const openSystem = openPath?.systemId
    ? (universe.galaxies
        .find((g) => g.id === openPath.galaxyId)
        ?.systems.find((s) => s.id === openPath.systemId) ?? null)
    : null;
  const openBody =
    openPath?.bodyId && openSystem
      ? (openSystem.planets.find((p) => p.id === openPath.bodyId) ?? null)
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
        <MapScene
          universe={universe}
          colonies={colonies}
          gateways={gateways}
          stations={stations}
          foreignStations={foreignStations}
          outposts={outposts}
          fleets={fleets}
          foreignFleets={foreignFleets}
          sites={sites}
          exploredSystemIds={exploredSystemIds}
          claimedSystemIds={game.claimedSystemIds}
          territories={territories}
          tick={game.tick}
          lastTickAt={game.lastTickAt}
          routeAnchor={anchor}
          routeDepth={depth}
          jumpTo={jumpTo}
          selectedId={selectedId}
          onSelectGalaxy={(g) => setSelectedId(g.id)}
          onSelectSystem={(s) => setSelectedId(s.id)}
          onSelectBody={(b) => setSelectedId(b.id)}
          onOpenFiche={openSheet}
          onSelectId={setSelectedId}
          onClearSelection={() => setSelectedId(null)}
          onViewChange={onViewChange}
        />
      </section>
      {/* Ouverture pleine : une modale qui laisse la carte visible derrière elle, au lieu
          du niveau de carte qui la remplaçait (chantier 35.6). */}
      {open && (
        <MapSheet
          universe={universe}
          openId={open}
          effects={effects}
          portalLinks={portalLinks}
          now={now}
          onOpenBody={(b) => openSheet(b.id)}
          onClose={() => openSheet(null)}
        />
      )}
      <aside className="side-panel">
        {shownSystem ? (
          <SystemPanel
            system={shownSystem}
            effects={effects}
            portalLinks={portalLinks}
            now={now}
            onOpenBody={(b) => openSheet(b.id)}
          />
        ) : anchor.galaxyId ? (
          <p className="muted">{t("app.selectSystemHint")}</p>
        ) : (
          <GatewaysPanel now={now} />
        )}
      </aside>
    </main>
  );
}

export function App({ auth }: Props) {
  const { t } = useTranslation();
  useGameConnection(auth.token!, auth.sessionExpired);
  const {
    playerId,
    universe,
    game,
    colonies,
    transfers,
    missions,
    exploredSystemIds,
    sites,
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
    outposts,
    stations,
    foreignStations,
    leaderboard,
    territories,
    objectives,
    worldEvents,
    unreadEventCount,
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
    return <div className="loading">{t("app.connecting")}</div>;
  }

  const colony = colonies.find((c) => c.id === colonyId) ?? colonies[0] ?? null;

  const routeTabs = [
    { value: "colony", label: t("app.tabColony") },
    { value: "stations", label: t("app.tabStations") },
    { value: "map", label: t("app.tabMap") },
    { value: "logistics", label: t("app.tabLogistics") },
    {
      value: "fleets",
      label:
        pirateLairs.length > 0
          ? t("app.tabFleetsWithLairs", { count: pirateLairs.length })
          : t("app.tabFleets"),
    },
    { value: "shipyard", label: t("app.tabShipyard") },
    { value: "research", label: t("app.tabResearch") },
    { value: "empire", label: t("app.tabEmpire") },
    { value: "corporation", label: t("app.tabCorporation") },
    { value: "comms", label: t("app.tabCommunication") },
    {
      value: "inbox",
      // Le compte de non-lus est dans l'onglet lui-même : c'est le seul endroit visible
      // depuis n'importe quel écran, et un joueur qui revient doit le voir sans chercher.
      label:
        unreadEventCount > 0
          ? t("app.tabInboxUnread", { count: unreadEventCount })
          : t("app.tabInbox"),
    },
  ].map((tab) => ({
    ...tab,
    href: `/${tab.value}${sharedSearch(location.search)}`,
  }));
  const activeTab = routeTabs.find((tab) =>
    location.pathname.startsWith(`/${tab.value}`),
  )?.value;

  return (
    <div className="layout">
      <TopBar
        items={routeTabs}
        active={activeTab}
        onNavChange={(value) =>
          navigate({
            pathname: `/${value}`,
            search: sharedSearch(location.search),
          })
        }
        status={{
          label: connected ? t("app.connected") : t("app.disconnected"),
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
        <Badge variant="violet" title={t("app.empireInfluence")}>
          ✦ {Math.floor(game.influence)}
        </Badge>
        <Badge>{t("app.tick", { value: game.tick })}</Badge>
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
          {auth.empire?.name ?? t("app.defaultEmpireName")}
        </span>
        <Button variant="link" onClick={() => void auth.logout()}>
          {t("app.logout")}
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
              to={{
                pathname: "/colony",
                search: sharedSearch(location.search),
              }}
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
          path="/comms"
          element={
            <main className="content-single">
              <CommunicationView now={now} />
            </main>
          }
        />
        <Route
          path="/corporation"
          element={
            <main className="content-single">
              <CorporationView />
            </main>
          }
        />
        <Route
          path="/inbox"
          element={
            <main className="content-single">
              <InboxView now={now} />
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
        {/* Une seule route de carte depuis le chantier 35.3 : la vue n'est plus une
            hiérarchie de niveaux mais un point visé et une profondeur, portés par la
            requête (`?at=`, `?z=`, `?open=`). */}
        <Route
          path="/map"
          element={
            <MapPage
              universe={universe}
              game={game}
              colony={colony}
              colonies={colonies}
              stations={stations}
              foreignStations={foreignStations}
              outposts={outposts}
              foreignFleets={foreignFleets}
              missions={missions}
              exploredSystemIds={exploredSystemIds}
              sites={sites}
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
      </Routes>
    </div>
  );
}
