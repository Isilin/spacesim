import type { EmpireEffects, Planet, Universe } from "@spacesim/shared";
import { Modal } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { BodyView } from "./BodyView.js";
import { GalaxyFiche } from "./GalaxyFiche.js";
import { SystemPanel } from "./SystemPanel.js";
import { buildUniverseIndex } from "./state/selectors.js";

interface Props {
  universe: Universe;
  /** Identifiant de l'élément ouvert — galaxie, système ou corps. */
  openId: string;
  effects: EmpireEffects;
  portalLinks: [string, string][];
  now: number;
  onOpenBody: (body: Planet) => void;
  onClose: () => void;
}

/**
 * Ouverture pleine d'un élément de la carte (chantier 35.6).
 *
 * Elle était un **niveau de carte** : ouvrir un corps remplaçait la scène 3D par une fiche
 * SVG, et l'on quittait la carte pour lire une fiche. La modale ne couvre qu'une partie de
 * l'écran, laisse la carte visible derrière et se referme d'une touche — regarder et lire
 * cessent d'être exclusifs.
 *
 * `Modal.Body` défile déjà (`max-height: 80vh`), ce qui compte ici : `BodyView` empile une
 * fiche physique, des gisements et une grille d'emplacements.
 */
export function MapSheet({
  universe,
  openId,
  effects,
  portalLinks,
  now,
  onOpenBody,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const path = buildUniverseIndex(universe).get(openId);
  if (!path) return null;

  const galaxy = universe.galaxies.find((g) => g.id === path.galaxyId) ?? null;
  const system = path.systemId
    ? (galaxy?.systems.find((s) => s.id === path.systemId) ?? null)
    : null;
  const body = path.bodyId
    ? (system?.planets.find((p) => p.id === path.bodyId) ?? null)
    : null;

  const title = body?.name ?? system?.name ?? galaxy?.name ?? "";

  return (
    <Modal onClose={onClose}>
      <Modal.Header title={title} closeLabel={t("app.closeSheet")} />
      <Modal.Body>
        {body && system ? (
          <BodyView system={system} body={body} effects={effects} now={now} />
        ) : system ? (
          <SystemPanel
            system={system}
            effects={effects}
            portalLinks={portalLinks}
            now={now}
            onOpenBody={onOpenBody}
          />
        ) : galaxy ? (
          <GalaxyFiche galaxy={galaxy} now={now} />
        ) : null}
      </Modal.Body>
    </Modal>
  );
}
