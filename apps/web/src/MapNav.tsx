import type { Colony, ClientUniverse } from "@spacesim/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@spacesim/ui";

/**
 * Cible de navigation : ce que la recherche et les raccourcis savent viser.
 *
 * Un simple identifiant depuis le chantier 35.3 — la carte n'a plus de niveaux, viser une
 * galaxie et viser un système sont le même geste, et l'index de l'univers retrouve seul le
 * chemin complet de ce qu'on lui nomme.
 */
export type NavTarget = { kind: "universe" } | { kind: "at"; id: string };

interface Props {
  universe: ClientUniverse;
  colonies: Colony[];
  exploredSystemIds: string[];
  /** Systèmes où le joueur a une flotte (raccourci « mes flottes »). */
  fleetSystemIds: string[];
  /** Système de la colonie active — cible du raccourci « ma capitale ». */
  homeSystemId: string | null;
  onGo: (target: NavTarget) => void;
}

interface Suggestion {
  key: string;
  label: string;
  hint: string;
  target: NavTarget;
}

const MAX_SUGGESTIONS = 8;

/**
 * Barre de navigation de la carte (chantier 9.7).
 *
 * Dans un univers illimité, le fil d'Ariane ne suffit plus : il faut pouvoir sauter
 * directement à un lieu connu. La recherche ne porte que sur ce que le joueur voit
 * réellement — galaxies, systèmes explorés, colonies — et n'ouvre donc aucune fuite
 * de brouillard.
 */
export function MapNav({
  universe,
  colonies,
  exploredSystemIds,
  fleetSystemIds,
  homeSystemId,
  onGo,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const index = useMemo<Suggestion[]>(() => {
    const explored = new Set(exploredSystemIds);
    const colonyByPlanet = new Map(colonies.map((c) => [c.planetId, c]));
    const items: Suggestion[] = [];
    for (const galaxy of universe.galaxies) {
      items.push({
        key: `g:${galaxy.id}`,
        label: galaxy.name,
        hint: t("mapNav.galaxy"),
        target: { kind: "at", id: galaxy.id },
      });
      for (const system of galaxy.systems) {
        const colony = system.planets
          .map((p) => colonyByPlanet.get(p.id))
          .find(Boolean);
        if (!explored.has(system.id) && !colony) continue;
        // Le nom d'une colonie contient déjà celui de son corps : ne pas le répéter.
        items.push({
          key: `s:${system.id}`,
          label: colony ? colony.name : system.name,
          hint: colony
            ? t("mapNav.colonyHint", {
                system: system.name,
                galaxy: galaxy.name,
              })
            : t("mapNav.systemHint", { galaxy: galaxy.name }),
          target: { kind: "at", id: system.id },
        });
      }
    }
    return items;
  }, [universe, colonies, exploredSystemIds, t]);

  const trimmed = query.trim().toLowerCase();
  const matches = trimmed
    ? index
        .filter((item) => item.label.toLowerCase().includes(trimmed))
        .slice(0, MAX_SUGGESTIONS)
    : [];

  const go = (target: NavTarget) => {
    setQuery("");
    onGo(target);
  };

  /** Systèmes où le joueur possède une colonie (la capitale d'abord si elle en est). */
  const colonySystems = useMemo(() => {
    const byPlanet = new Map(
      universe.galaxies.flatMap((g) =>
        g.systems.flatMap((s) => s.planets.map((p) => [p.id, s.id] as const)),
      ),
    );
    return colonies
      .map((c) => byPlanet.get(c.planetId))
      .filter((v): v is string => v !== undefined);
  }, [universe, colonies]);

  const homeTarget =
    colonySystems.find((id) => id === homeSystemId) ?? colonySystems[0];
  const fleetTarget = universe.galaxies
    .flatMap((g) => g.systems)
    .filter((s) => fleetSystemIds.includes(s.id))
    .map((s) => s.id)[0];

  return (
    <div className="map-nav">
      <div className="map-nav-history">
        <button
          type="button"
          title={t("mapNav.prev")}
          onClick={() => navigate(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          title={t("mapNav.next")}
          onClick={() => navigate(1)}
        >
          ›
        </button>
      </div>

      <div className="map-search">
        <input
          type="search"
          value={query}
          placeholder={t("mapNav.searchPlaceholder")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) go(matches[0].target);
            if (e.key === "Escape") setQuery("");
          }}
        />
        {matches.length > 0 && (
          <ul className="map-suggestions">
            {matches.map((item) => (
              <li key={item.key}>
                <button type="button" onClick={() => go(item.target)}>
                  <span>{item.label}</span>
                  <span className="muted small">{item.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {trimmed && matches.length === 0 && (
          <ul className="map-suggestions">
            <li className="muted small map-no-match">{t("mapNav.noMatch")}</li>
          </ul>
        )}
      </div>

      <div className="map-shortcuts">
        <Button
          disabled={!homeTarget}
          onClick={() => homeTarget && go({ kind: "at", id: homeTarget })}
        >
          {t("mapNav.myCapital")}
        </Button>
        <Button
          disabled={!fleetTarget}
          title={fleetTarget ? "" : t("mapNav.noActiveFleet")}
          onClick={() => fleetTarget && go({ kind: "at", id: fleetTarget })}
        >
          {t("mapNav.myFleets")}
        </Button>
        <Button onClick={() => go({ kind: "universe" })}>
          {t("mapNav.overview")}
        </Button>
      </div>
    </div>
  );
}
