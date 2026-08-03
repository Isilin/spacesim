import { createContext, PropsWithChildren, useContext } from "react";

interface ModalContext {
  onClose?: () => void;
}

const ctx = createContext<ModalContext | null>(null);

export const ModalProvider = ({
  children,
  onClose,
}: PropsWithChildren<ModalContext>) => {
  return <ctx.Provider value={{ onClose }}>{children}</ctx.Provider>;
};

export const useModalContext = () => {
  const context = useContext(ctx);
  if (!context) {
    throw new Error("useModalContext must be used within a ModalProvider");
  }
  return context;
};
