import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";
import styles from "./modal.module.css";
import { ModalHeader } from "./ModalHeader";
import { ModalActions } from "./ModalActions";
import { ModalBody } from "./ModalBody";
import { ModalProvider, useModalContext } from "./modal.context";

export interface ModalProps {
  open?: boolean;
  onClose?: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Dialogue modal accessible (chantier 27.21) : `role="dialog"` + `aria-modal`,
 *  libellé par `Modal.Header` via le contexte, piège à focus (Tab/Shift+Tab bouclent
 *  dans le dialogue), fermeture au clavier (Échap), et restauration du focus sur
 *  l'élément qui avait le focus avant ouverture (le déclencheur, typiquement). */
const ModalDialog = ({
  onClose,
  children,
}: PropsWithChildren<{ onClose?: () => void }>) => {
  const { titleId } = useModalContext();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const target =
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialogRef.current;
    target?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose?.();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.modalIn}>{children}</div>
      </div>
    </div>
  );
};

export const Modal = ({
  open = true,
  onClose,
  children,
}: PropsWithChildren<ModalProps>) => {
  if (!open) return null;

  return createPortal(
    <ModalProvider onClose={onClose}>
      <ModalDialog onClose={onClose}>{children}</ModalDialog>
    </ModalProvider>,
    document.body,
  );
};

Modal.displayName = "Modal";
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Actions = ModalActions;
