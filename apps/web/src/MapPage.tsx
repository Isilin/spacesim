import {
  allPlanets,
  type ClientUniverse,
  type Colony,
  type EmpireEffects,
  type Fleet,
  type ForeignFleet,
  type ForeignStation,
  type GameState,
  type Gateway,
  type MiningOutpost,
  type Station,
  type SystemSite,
  type Territory,
} from "@spacesim/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { GatewaysPanel } from "./GatewaysPanel.js";
import { MapNav, type NavTarget } from "./MapNav.js";
import { MapSheet } from "./MapSheet.js";
import { SystemPanel } from "./SystemPanel.js";
import { useMapView } from "./hooks/useMapView.js";
import { MapScene } from "./map3d/MapScene.js";
import { buildUniverseIndex } from "./state/selectors.js";

/**
 * Extrait de `App.tsx` au chantier 49. Tant que ce composant vivait dans le module
 * d'entrée, l'import de `map3d/MapScene` y mettait three.js, @react-three/fiber, drei et
 * @use-gesture — soit l'essentiel des 1,59 Mo d'un bundle en un seul morceau — et aucune
 * route ne pouvait être chargée paresseusement.
 */
export interface MapPageProps {
  universe: ClientUniverse;
  game: GameState;
  colony: Colony | null;
  colonies: Colony[];
  stations: Station[];
  foreignStations: ForeignStation[];
  outposts: MiningOutpost[];
  foreignFleets: ForeignFleet[];
  exploredSystemIds: string[];
  /** Sites révélés par les scans (chantier 31.11), rendus dans la vue système. */
  sites: SystemSite[];
  gateways: Gateway[];
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
export function MapPage({
  universe,
  game,
  colony,
  colonies,
  stations,
  foreignStations,
  outposts,
  foreignFleets,
  exploredSystemIds,
  sites,
  gateways,
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
