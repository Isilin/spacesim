import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Entry {
  id: string;
  label: string;
  /** Détail secondaire lu après le libellé (exploré, colonisé, hostile…). */
  detail?: string;
  selected?: boolean;
}

interface Props {
  /** Titre de la liste, annoncé avant les entrées. */
  label: string;
  entries: Entry[];
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

/** Clé de mémorisation de l'état du panneau. */
const STORAGE_KEY = "spacesim.map.list";

/**
 * État d'ouverture retenu de la session précédente, replié par défaut.
 *
 * Le stockage est lu dans un `try` et pas seulement testé : un navigateur en navigation
 * privée, ou configuré pour refuser le stockage de site, **lève** à l'accès plutôt que de
 * rendre `null`. La carte doit alors s'ouvrir repliée, pas ne pas s'ouvrir du tout.
 */
export function readPanelOpen(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

/** Retient l'état pour la prochaine session, en silence si le stockage est refusé. */
export function writePanelOpen(open: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, open ? "open" : "closed");
  } catch {
    // Un panneau qui ne se souvient pas reste un panneau qui fonctionne.
  }
}

/**
 * Liste DOM parallèle au canvas 3D (chantier 31.16), devenue panneau dépliable en
 * surimpression (chantier 36.4).
 *
 * Un canvas WebGL est **opaque** aux lecteurs d'écran : il ne publie ni structure ni
 * texte, et aucun raccourci clavier braqué sur la caméra n'y changerait rien. La parité
 * d'accessibilité obtenue en 27.21 sur `ZoomableSvg` — où les éléments étaient de vrais
 * nœuds SVG — exige donc ici un second rendu, navigable au clavier, portant les mêmes
 * actions que le clic et le double-clic dans la scène.
 *
 * Depuis que les noms se posent sur les objets (chantier 36.3), cette liste n'est plus la
 * seule façon de lire la carte : elle rendait 210 px de largeur à une colonne de texte que
 * la scène dit désormais elle-même. Elle se replie donc, et son état suit le joueur d'une
 * session à l'autre. Elle ne disparaît pas : c'est toujours le seul chemin clavier vers les
 * objets, et la façon la plus rapide de trouver un nom dans une vue dense.
 *
 * Elle est posée hors du flux, par-dessus la carte. Ce qui la met aussi hors du chemin de
 * la molette : l'écouteur de zoom vit sur la section du canvas, dont ce panneau n'est pas
 * un descendant, si bien que la molette y défile la liste sans toucher au zoom.
 */
export function MapList({ label, entries, onSelect, onOpen }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(readPanelOpen);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    writePanelOpen(next);
  };

  return (
    <div className="map-objects">
      <button
        type="button"
        className="map-objects-toggle"
        aria-expanded={open}
        onClick={toggle}
      >
        {t("mapList.toggle", { count: entries.length })}
      </button>
      {open && (
        <nav className="map-list" aria-label={label}>
          <ul>
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  data-selected={entry.selected ? "true" : undefined}
                  aria-current={entry.selected ? "true" : undefined}
                  onClick={() => onSelect(entry.id)}
                  onDoubleClick={() => onOpen(entry.id)}
                  onKeyDown={(e) => {
                    // Entrée vole jusqu'à l'objet, comme le double-clic dans la scène.
                    // `preventDefault` avant tout : sans lui le navigateur déclenche AUSSI
                    // le `onClick` du bouton, et la touche faisait sélectionner puis voler.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onOpen(entry.id);
                    }
                  }}
                >
                  <span>{entry.label}</span>
                  {entry.detail && (
                    <span className="muted">{entry.detail}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
