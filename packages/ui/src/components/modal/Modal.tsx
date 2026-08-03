import type { MouseEvent, PropsWithChildren, ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./modal.module.css";
import { ModalHeader } from "./ModalHeader";
import { ModalActions } from "./ModalActions";
import { ModalBody } from "./ModalBody";

export interface ModalProps {
  open?: boolean;
  onClickOutside?: () => void;
}

export const Modal = ({
  open = true,
  onClickOutside,
  children,
}: PropsWithChildren<ModalProps>) => {
  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClickOutside}>
      <div
        className={styles.modal}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className={styles.modalIn}>{children}</div>
      </div>
    </div>,
    document.body,
  );
};

Modal.displayName = "Modal";
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Actions = ModalActions;
