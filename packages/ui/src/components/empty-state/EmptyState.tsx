import type { ReactNode } from "react";
import styles from "./empty-state.module.css";

export interface EmptyStateProps {
  icon?: ReactNode;
  children?: ReactNode;
}

export function EmptyState({ icon, children }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.icon}>{icon || "—"}</div>
      <div className={styles.text}>{children}</div>
    </div>
  );
}
