import { Button } from "../button/Button";
import styles from "./modalHeader.module.css";

export interface ModalHeaderProps {
  title: string;
  onClose?: () => void;
}

export const ModalHeader = ({ title, onClose }: ModalHeaderProps) => (
  <div className={styles.head}>
    <span className={styles.title}>{title}</span>
    {onClose && (
      <Button size="sm" variant="ghost" onClick={onClose}>
        ×
      </Button>
    )}
  </div>
);

ModalHeader.displayName = "Modal.Header";
