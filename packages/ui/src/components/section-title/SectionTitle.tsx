import type { ReactNode } from "react";
import styles from "./section-title.module.css";

export interface SectionTitleProps {
  children?: ReactNode;
}

export function SectionTitle({ children }: SectionTitleProps) {
  return <div className={styles.sectionTitle}>{children}</div>;
}
