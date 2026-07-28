import type { ReactNode } from "react";
import styles from "./toast.module.css";

export interface ToastProps {
  variant?: "info" | "error";
  children?: ReactNode;
}

export function Toast({ variant = "info", children }: ToastProps) {
  return (
    <div className={styles.toast} data-variant={variant}>
      <div className={styles.toastIn}>{children}</div>
    </div>
  );
}
