import type { MouseEvent, ReactNode } from "react";

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
    <div className="ss-modal-overlay" onClick={onClose}>
      <div className="ss-cut-frame ss-modal" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <div className="ss-cut-in">
          <div className="ss-modal-head">
            <span className="ss-modal-title">{title}</span>
            {onClose && (
              <button type="button" className="ss-modal-close" onClick={onClose}>
                ×
              </button>
            )}
          </div>
          {children}
          {actions && <div className="ss-modal-actions">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
