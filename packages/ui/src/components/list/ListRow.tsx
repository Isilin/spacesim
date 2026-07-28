import type { ReactNode } from "react";
import styles from "./list.module.css";

export interface ListRowProps {
  title: string;
  level?: string;
  meta?: string;
  right?: ReactNode;
  children?: ReactNode;
}

export function ListRow({ title, level, meta, right, children }: ListRowProps) {
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>
          <span>{title}</span>
          {level && <span className={styles.rowLevel}>{level}</span>}
        </div>
        {meta && <span className={styles.rowMeta}>{meta}</span>}
      </div>
      {right || children}
    </li>
  );
}
