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

/**
 * Liste DOM parallèle au canvas 3D (chantier 31.16).
 *
 * Un canvas WebGL est **opaque** aux lecteurs d'écran : il ne publie ni structure ni
 * texte, et aucun raccourci clavier braqué sur la caméra n'y changerait rien. La parité
 * d'accessibilité obtenue en 27.21 sur `ZoomableSvg` — où les éléments étaient de vrais
 * nœuds SVG — exige donc ici un second rendu, navigable au clavier, portant les mêmes
 * actions que le clic et le double-clic dans la scène.
 *
 * Elle reste visible pour tout le monde : c'est aussi le moyen le plus rapide de
 * trouver un objet par son nom dans une vue dense.
 */
export function MapList({ label, entries, onSelect, onOpen }: Props) {
  return (
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
                // Entrée ouvre, comme le double-clic dans la scène.
                if (e.key === "Enter") {
                  e.preventDefault();
                  onOpen(entry.id);
                }
              }}
            >
              <span>{entry.label}</span>
              {entry.detail && <span className="muted">{entry.detail}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
