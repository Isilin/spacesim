import { computeEffects, gatewayLinks, type TechId } from "@spacesim/shared";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import { ResearchView } from "./ResearchView.js";
import { LogisticsView } from "./LogisticsView.js";
import { useGameConnection } from "./hooks/useGameConnection.js";
import { useGameStore } from "./state/game-store.js";
import { useNotifications } from "./useNotifications.js";
import type { Auth } from "./useAuth.js";

/**
 * Les trois routes qui touchent la 3D, chargées à la demande (chantier 49).
 *
 * Elles étaient les trois seules arêtes qui tiraient three.js, @react-three/fiber, drei
 * et @use-gesture dans le module d'entrée — `MapScene` directement, `ShipDesigner` et
 * `StationsView` par `map3d/ModelPreview`. Les huit autres routes n'ont aucune 3D et
 * restent chargées d'emblée : les découper n'apporterait rien de mesurable.
 *
 * `React.lazy` attend un export par défaut ; le dépôt n'en utilise nulle part, d'où la
 * réécriture explicite plutôt qu'un `export default` posé pour l'occasion.
 */
const MapPage = lazy(() =>
  import("./MapPage.js").then((m) => ({ default: m.MapPage })),
);
const ShipDesigner = lazy(() =>
  import("./ShipDesigner.js").then((m) => ({ default: m.ShipDesigner })),
);
const StationsView = lazy(() =>
  import("./StationsView.js").then((m) => ({ default: m.StationsView })),
);

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

      {/* Repli `null` volontaire : les sélecteurs `.map-canvas`, `.model-preview` et
          `data-map-tier` portent les assertions e2e, et un repli qui rendrait un autre
          élément les perturberait. Les specs attendent déjà l'apparition du canevas. */}
      <Suspense fallback={null}>
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
                exploredSystemIds={exploredSystemIds}
                sites={sites}
                gateways={gateways}
                territories={territories}
                fleets={fleets}
                effects={effects}
                portalLinks={portalLinks}
                now={now}
              />
            }
          />
        </Routes>
      </Suspense>
    </div>
  );
}
