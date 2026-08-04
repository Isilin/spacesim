import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import styles from "./popover.module.css";

export interface PopoverProps {
  style?: CSSProperties;
  children?: ReactNode;
  /** Nom accessible du panneau (`aria-label`) — recommandé, `packages/ui` restant
   *  agnostique de la traduction : l'appelant fournit le libellé dans sa locale. */
  "aria-label"?: string;
  /** Fermeture au clavier (Échap) — optionnel : un `Popover` sans état d'ouverture
   *  propre (rendu conditionnel par l'appelant) n'a rien à fermer lui-même. */
  onClose?: () => void;
}

/** Panneau contextuel non modal (chantier 27.21) : contrairement à `Modal`, le reste de
 *  la page reste utilisable — pas de piège à focus ni de restauration de focus, juste
 *  Échap pour fermer et un focus initial sur le premier élément interactif du panneau. */
export function Popover({
  style,
  children,
  "aria-label": ariaLabel,
  onClose,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose?.();
    }
  };

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: <dialog> natif est modal par défaut (backdrop, showModal()) ; ce panneau est volontairement non modal, role="dialog" sur un div est le motif standard pour ce cas.
      ref={ref}
      role="dialog"
      aria-label={ariaLabel}
      className={styles.popover}
      style={style}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.popoverIn}>{children}</div>
    </div>
  );
}
