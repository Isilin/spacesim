import type { ReactNode } from "react";
import styles from "./toast.module.css";

export interface ToastStackProps {
  children?: ReactNode;
}

export function ToastStack({ children }: ToastStackProps) {
  return <div className={styles.stack}>{children}</div>;
}
