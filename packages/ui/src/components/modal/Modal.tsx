import type { MouseEvent, ReactNode } from "react";
import styles from "./modal.module.css";

export interface ModalProps {
  open?: boolean;
  title?: string;
  onClose?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Modal({ open = true, title, onClose, actions, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e: MouseEvent) => e.stopPropagation()}>
        <div className={styles.modalIn}>
          <div className={styles.head}>
            <span className={styles.title}>{title}</span>
            {onClose && (
              <button type="button" className={styles.close} onClick={onClose}>
                ×
              </button>
            )}
          </div>
          {children}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      </div>
    </div>
  );
}
