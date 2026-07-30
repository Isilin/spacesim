import type { PropsWithChildren } from "react";
import styles from "./modalActions.module.css";

export const ModalActions = ({ children }: PropsWithChildren) => (
  <div className={styles.actions}>{children}</div>
);

ModalActions.displayName = "Modal.Actions";
