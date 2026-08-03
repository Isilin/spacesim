import { PropsWithChildren } from "react";
import styles from "./modalBody.module.css";

export const ModalBody = ({ children }: PropsWithChildren) => {
  return <div className={styles.body}>{children}</div>;
};

ModalBody.displayName = "ModalBody";
