import type { ReactNode } from "react";

export interface ToastStackProps {
  children?: ReactNode;
}

export function ToastStack({ children }: ToastStackProps) {
  return <div className="ss-toast-stack">{children}</div>;
}
