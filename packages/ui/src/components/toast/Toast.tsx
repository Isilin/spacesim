import type { ReactNode } from "react";

export interface ToastProps {
  variant?: "info" | "error";
  children?: ReactNode;
}

export function Toast({ variant = "info", children }: ToastProps) {
  return (
    <div className={`ss-cut-frame ss-toast ss-toast--${variant}`}>
      <div className="ss-cut-in">{children}</div>
    </div>
  );
}
