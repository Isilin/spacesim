import type { ReactNode } from "react";
import styles from "./panel.module.css";

export interface PanelProps {
  title?: string;
  accent?: "cyan" | "violet" | "amber";
  glow?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Panel({ title, accent = "cyan", glow = false, actions, children }: PanelProps) {
  return (
    <div className={styles.panel} data-accent={accent} data-glow={glow}>
      <div className={styles.panelIn}>
        {title && (
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>{title}</h3>
            {actions && <div className={styles.panelActions}>{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
