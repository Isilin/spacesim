import { galaxyIndexOfId, type Galaxy } from "@spacesim/shared";
import { Panel, Stat } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { GatewaysPanel } from "./GatewaysPanel.js";
import { useGameStore } from "./state/game-store.js";

interface Props {
  galaxy: Galaxy;
  now: number;
}

/**
 * Fiche d'une galaxie (chantier 35.6).
 *
 * Elle n'existait pas : sélectionner une galaxie n'ouvrait rien, le panneau latéral ne
 * calculant de contenu qu'à partir du niveau galaxie. C'était le trou le plus visible du
 * modèle à quatre niveaux — le seul objet de la carte dont on ne pouvait rien apprendre.
 *
 * Le portail inter-galactique y est rendu filtré sur cette galaxie : c'est à elle qu'il
 * appartient, et l'y trouver vaut mieux que de le chercher dans une liste de tous les
 * portails de l'univers.
 */
export function GalaxyFiche({ galaxy, now }: Props) {
  const { t } = useTranslation();
  const { colonies, exploredSystemIds, game } = useGameStore();

  const explored = new Set(exploredSystemIds);
  const claimed = new Set(game?.claimedSystemIds ?? []);
  const colonised = new Set(
    galaxy.systems
      .filter((s) =>
        s.planets.some((p) => colonies.some((c) => c.planetId === p.id)),
      )
      .map((s) => s.id),
  );

  const count = (ids: Set<string>) =>
    galaxy.systems.filter((s) => ids.has(s.id)).length;

  return (
    <>
      <Panel title={galaxy.name}>
        <div className="stat-row">
          <Stat
            label={t("galaxyFiche.systems")}
            value={String(galaxy.systems.length)}
          />
          <Stat
            label={t("galaxyFiche.explored")}
            value={String(count(explored))}
          />
          <Stat
            label={t("galaxyFiche.colonized")}
            value={String(colonised.size)}
          />
          <Stat
            label={t("galaxyFiche.claimed")}
            value={String(count(claimed))}
          />
        </div>
        <p className="small muted">
          {t("galaxyFiche.rank", {
            rank: galaxyIndexOfId(galaxy.id),
            bonus: galaxy.depositBonus,
          })}
        </p>
      </Panel>
      <GatewaysPanel now={now} galaxyId={galaxy.id} />
    </>
  );
}
