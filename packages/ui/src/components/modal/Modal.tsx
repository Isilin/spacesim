import type { MouseEvent, PropsWithChildren, ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./modal.module.css";
import { ModalHeader } from "./ModalHeader";
import { ModalActions } from "./ModalActions";
import { ModalBody } from "./ModalBody";
import { ModalProvider } from "./modal.context";

export interface ModalProps {
  open?: boolean;
  onClose?: () => void;
}

export const Modal = ({
  open = true,
  onClose,
  children,
}: PropsWithChildren<ModalProps>) => {
  if (!open) return null;

  return createPortal(
    <ModalProvider onClose={onClose}>
      <div className={styles.overlay} onClick={onClose}>
        <div
          className={styles.modal}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <div className={styles.modalIn}>{children}</div>
        </div>
      </div>
    </ModalProvider>,
    document.body,
  );
};

Modal.displayName = "Modal";
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Actions = ModalActions;
