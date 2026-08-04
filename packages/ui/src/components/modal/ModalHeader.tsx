import { useEffect, useId } from "react";
import { Button } from "../button/Button";
import { useModalContext } from "./modal.context";
import styles from "./modalHeader.module.css";

export interface ModalHeaderProps {
  title: string;
  /** Nom accessible du bouton de fermeture (`aria-label`) — `packages/ui` reste
   *  agnostique de la traduction, l'appelant fournit le libellé dans sa locale. */
  closeLabel?: string;
}

export const ModalHeader = ({
  title,
  closeLabel = "Close",
}: ModalHeaderProps) => {
  const { onClose, setTitleId } = useModalContext();
  const titleId = useId();

  // Enregistre l'id du titre auprès du dialogue parent pour `aria-labelledby` — un
  // seul `Modal.Header` par `Modal` dans l'usage actuel, donc pas de conflit à arbitrer.
  useEffect(() => {
    setTitleId(titleId);
    return () => setTitleId(undefined);
  }, [titleId, setTitleId]);

  return (
    <div className={styles.head}>
      <span id={titleId} className={styles.title}>
        {title}
      </span>
      {onClose && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label={closeLabel}
        >
          ×
        </Button>
      )}
    </div>
  );
};

ModalHeader.displayName = "Modal.Header";
