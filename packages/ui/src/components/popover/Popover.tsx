import type { CSSProperties, ReactNode } from "react";
import styles from "./popover.module.css";

export interface PopoverProps {
  style?: CSSProperties;
  children?: ReactNode;
}

export function Popover({ style, children }: PopoverProps) {
  return (
    <div className={styles.popover} style={style}>
      <div className={styles.popoverIn}>{children}</div>
    </div>
  );
}
