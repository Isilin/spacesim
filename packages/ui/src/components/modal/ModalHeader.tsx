import { Button } from "../button/Button";
import { useModalContext } from "./modal.context";
import styles from "./modalHeader.module.css";

export interface ModalHeaderProps {
  title: string;
}

export const ModalHeader = ({ title }: ModalHeaderProps) => {
  const { onClose } = useModalContext();

  return (
    <div className={styles.head}>
      <span className={styles.title}>{title}</span>
      {onClose && (
        <Button size="sm" variant="ghost" onClick={onClose}>
          ×
        </Button>
      )}
    </div>
  );
};

ModalHeader.displayName = "Modal.Header";
