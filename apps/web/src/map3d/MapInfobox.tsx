import { Html } from "@react-three/drei";
import type { Galaxy, Planet, StarSystem } from "@spacesim/shared";
import { Button, Popover } from "@spacesim/ui";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { planetTypeLabel, starClassLabel } from "../labels.js";

/** Ce que l'infobox sait décrire — les trois natures d'objet que la carte sait viser. */
export type MapTarget =
  | { kind: "galaxy"; galaxy: Galaxy; colonized: boolean }
  | {
      kind: "system";
      system: StarSystem;
      explored: boolean;
      colonized: boolean;
      /** Classe de l'étoile, dérivée du système (chantier 35.10). */
      starClass: string;
    }
  | { kind: "body"; body: Planet; moons: number }
  /**
   * Tout ce que le système contient d'autre : comptoir, station, avant-poste, ceinture,
   * site de scan. Aucun n'était sélectionnable avant le chantier 35.8 — la ceinture et le
   * site n'avaient même pas de gestionnaire de clic.
   */
  | { kind: "feature"; name: string; detail: string };

interface Props {
  target: MapTarget;
  /** Surcouche DOM où poser l'infobox, hors du conteneur `aria-hidden` de R3F. */
  portal: RefObject<HTMLDivElement | null>;
  /** Ouvre la fiche complète — absent tant qu'il n'y en a pas pour cette nature d'objet. */
  onOpen?: () => void;
  onClose: () => void;
}

/**
 * Infobox ancrée sur l'objet sélectionné (chantier 35.5).
 *
 * Sélectionner ouvrait jusqu'ici un panneau latéral fixe, à 340 px du regard, et
 * sélectionner une galaxie n'ouvrait rien du tout. L'information vient désormais se poser
 * là où l'on a cliqué.
 *
 * `Popover` est monté avec `autoFocus={false}` : il prend sinon le focus au montage, ce
 * qui le retire à la section qui porte les raccourcis de caméra — le joueur perdrait le
 * pilotage de sa vue en sélectionnant un objet. Le chemin clavier passe par la liste DOM
 * parallèle, qui garde le focus là où il était.
 */
export function MapInfobox({ target, portal, onOpen, onClose }: Props) {
  const { t } = useTranslation();

  const name =
    target.kind === "galaxy"
      ? target.galaxy.name
      : target.kind === "system"
        ? target.system.name
        : target.kind === "body"
          ? target.body.name
          : target.name;

  return (
    <Html
      // Pas de `distanceFactor` : seule la projection du point compte, l'infobox garde sa
      // taille en pixels. Sans cela, un palier à l'échelle 10⁻³ la réduirait à rien — les
      // couches de carte sont imbriquées, pas à l'échelle de l'écran.
      //
      // Décalée sur le côté plutôt que centrée sur l'objet : posée dessus, elle le
      // masquait — et surtout elle avalait la molette, la carte cessant de zoomer
      // exactement là où le joueur venait de cliquer.
      zIndexRange={[40, 0]}
      portal={portal as RefObject<HTMLElement>}
      style={{ pointerEvents: "auto", transform: "translate(16px, -50%)" }}
    >
      <Popover
        aria-label={t("mapInfobox.ariaLabel", { name })}
        onClose={onClose}
        autoFocus={false}
      >
        <div className="map-infobox">
          <h3>{name}</h3>
          {target.kind === "galaxy" && (
            <p className="small muted">
              {t("mapInfobox.galaxySystems", {
                count: target.galaxy.systems.length,
              })}
              {target.colonized ? ` · ${t("universeMap.colonized")}` : ""}
            </p>
          )}
          {target.kind === "system" && (
            <p className="small muted">
              {starClassLabel(target.starClass)}
              {" · "}
              {t("mapInfobox.systemBodies", {
                planets: target.system.planets.filter(
                  (p) => p.kind === "planet",
                ).length,
                moons: target.system.planets.filter((p) => p.kind === "moon")
                  .length,
              })}
              {" · "}
              {target.colonized
                ? t("galaxyMap.colonized")
                : target.explored
                  ? t("galaxyMap.explored")
                  : t("galaxyMap.unexplored")}
            </p>
          )}
          {target.kind === "body" && (
            <p className="small muted">
              {target.body.kind === "moon"
                ? t("bodyView.moon")
                : t("bodyView.planet")}{" "}
              {planetTypeLabel(target.body.type).toLowerCase()}
              {" · "}
              {t("systemView.habitability", {
                value: target.body.habitability,
              })}
              {target.moons > 0
                ? ` · ${t("mapInfobox.moons", { count: target.moons })}`
                : ""}
            </p>
          )}
          {target.kind === "feature" && (
            <p className="small muted">{target.detail}</p>
          )}
          {onOpen && (
            <Button size="sm" onClick={onOpen}>
              {t("mapInfobox.open")}
            </Button>
          )}
        </div>
      </Popover>
    </Html>
  );
}
