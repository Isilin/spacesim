import type { Colony, Universe } from "@spacesim/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@spacesim/ui";

/** Cible de navigation : ce que la recherche et les raccourcis savent ouvrir. */
export type NavTarget =
  | { kind: "universe" }
  | { kind: "galaxy"; galaxyId: string }
  | { kind: "system"; galaxyId: string; systemId: string };

interface Props {
  universe: Universe;
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
        hint: "Galaxie",
        target: { kind: "galaxy", galaxyId: galaxy.id },
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
            ? `Colonie · ${system.name} · ${galaxy.name}`
            : `Système · ${galaxy.name}`,
          target: { kind: "system", galaxyId: galaxy.id, systemId: system.id },
        });
      }
    }
    return items;
  }, [universe, colonies, exploredSystemIds]);

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

  /** Premier système où le joueur possède une colonie (hors capitale déjà proposée). */
  const colonySystems = useMemo(() => {
    const byPlanet = new Map(
      universe.galaxies.flatMap((g) =>
        g.systems.flatMap((s) =>
          s.planets.map((p) => [p.id, { galaxy: g.id, system: s.id }] as const),
        ),
      ),
    );
    return colonies
      .map((c) => byPlanet.get(c.planetId))
      .filter((v): v is { galaxy: string; system: string } => v !== undefined);
  }, [universe, colonies]);

  const homeTarget =
    colonySystems.find((s) => s.system === homeSystemId) ?? colonySystems[0];
  const fleetTarget = universe.galaxies.flatMap((g) =>
    g.systems
      .filter((s) => fleetSystemIds.includes(s.id))
      .map((s) => ({ galaxy: g.id, system: s.id })),
  )[0];

  return (
    <div className="map-nav">
      <div className="map-nav-history">
        <button type="button" title="Précédent" onClick={() => navigate(-1)}>
          ‹
        </button>
        <button type="button" title="Suivant" onClick={() => navigate(1)}>
          ›
        </button>
      </div>

      <div className="map-search">
        <input
          type="search"
          value={query}
          placeholder="Rechercher une galaxie, un système, une colonie…"
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
            <li className="muted small map-no-match">
              Aucun lieu connu ne correspond.
            </li>
          </ul>
        )}
      </div>

      <div className="map-shortcuts">
        <Button
          disabled={!homeTarget}
          onClick={() =>
            homeTarget &&
            go({
              kind: "system",
              galaxyId: homeTarget.galaxy,
              systemId: homeTarget.system,
            })
          }
        >
          Ma capitale
        </Button>
        <Button
          disabled={!fleetTarget}
          title={fleetTarget ? "" : "Aucune flotte en service"}
          onClick={() =>
            fleetTarget &&
            go({
              kind: "system",
              galaxyId: fleetTarget.galaxy,
              systemId: fleetTarget.system,
            })
          }
        >
          Mes flottes
        </Button>
        <Button onClick={() => go({ kind: "universe" })}>Vue d'ensemble</Button>
      </div>
    </div>
  );
}
