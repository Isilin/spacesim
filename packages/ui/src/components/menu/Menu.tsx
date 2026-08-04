import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import styles from "./menu.module.css";

export interface MenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface MenuProps {
  items: (MenuItem | "separator")[];
  style?: CSSProperties;
  /** Fermeture au clavier (Échap) — optionnel : un `Menu` sans état d'ouverture propre
   *  (rendu conditionnel par l'appelant) n'a rien à fermer lui-même. */
  onClose?: () => void;
}

/** Menu accessible (chantier 27.21) : `role="menu"`/`"menuitem"`, navigation Haut/Bas/
 *  Home/End au clavier entre les entrées, Échap ferme via `onClose` si fourni. */
export function Menu({ items = [], style, onClose }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const itemEls = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = itemEls();
    if (els.length === 0) return;
    const currentIndex = els.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(currentIndex + 1) % els.length]!.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(currentIndex - 1 + els.length) % els.length]!.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]!.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]!.focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onClose?.();
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      className={styles.menu}
      style={style}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.menuIn}>
        {items.map((it, i) =>
          it === "separator" ? (
            <div key={i} role="separator" className={styles.menuSep} />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              data-danger={!!it.danger}
              disabled={it.disabled}
              onClick={it.onClick}
            >
              {it.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
