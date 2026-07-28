import type { ReactNode } from "react";
import { Link } from "../link/Link.js";
import styles from "./topbar.module.css";

export interface TopBarNavItem {
  value: string;
  label: ReactNode;
  href?: string;
  disabled?: boolean;
}

export interface TopBarStatus {
  label: ReactNode;
  tone?: "ok" | "ko" | "violet";
}

export interface TopBarProps {
  brand?: string;
  items?: TopBarNavItem[];
  active?: string;
  onNavChange?: (value: string) => void;
  status?: TopBarStatus;
  children?: ReactNode;
}

export function TopBar({
  brand = "SPACESIM",
  items = [],
  active,
  onNavChange,
  status,
  children,
}: TopBarProps) {
  return (
    <header className={styles.topbar}>
      <span className={styles.brand}>{brand}</span>
      <nav className={styles.nav}>
        {items.map((it) => (
          <Link
            key={it.value}
            variant="nav"
            href={it.href}
            active={it.value === active}
            disabled={it.disabled}
            onClick={(e) => {
              if (it.disabled) return;
              if (
                e.defaultPrevented ||
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
              )
                return;
              if (it.href) e.preventDefault();
              onNavChange?.(it.value);
            }}
          >
            {it.label}
          </Link>
        ))}
      </nav>
      {children && <div className={styles.actions}>{children}</div>}
      {status && (
        <div className={styles.status}>
          <span className={styles.dot} data-tone={status.tone ?? "ok"} />
          <b>{status.label}</b>
        </div>
      )}
    </header>
  );
}
