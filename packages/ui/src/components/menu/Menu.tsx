import type { CSSProperties } from "react";

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
    <div className="ss-cut-frame ss-menu" style={style}>
      <div className="ss-cut-in">
        {items.map((it, i) =>
          it === "separator" ? (
            <div key={i} className="ss-menu-sep" />
          ) : (
            <button
              key={i}
              type="button"
              className="ss-menu-item"
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
