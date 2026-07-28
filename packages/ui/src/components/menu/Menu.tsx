import type { CSSProperties } from "react";
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
}

export function Menu({ items = [], style }: MenuProps) {
  return (
    <div className={styles.menu} style={style}>
      <div className={styles.menuIn}>
        {items.map((it, i) =>
          it === "separator" ? (
            <div key={i} className={styles.menuSep} />
          ) : (
            <button
              key={i}
              type="button"
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
