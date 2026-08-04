import { createContext, PropsWithChildren, useContext, useState } from "react";

interface ModalContext {
  onClose?: () => void;
  /** Id du titre courant (posé par `Modal.Header`), pour `aria-labelledby` sur le
   *  conteneur de dialogue — undefined si aucun `Modal.Header` n'est monté. */
  titleId?: string;
  setTitleId: (id: string | undefined) => void;
}

const ctx = createContext<ModalContext | null>(null);

export const ModalProvider = ({
  children,
  onClose,
}: PropsWithChildren<Pick<ModalContext, "onClose">>) => {
  const [titleId, setTitleId] = useState<string | undefined>(undefined);
  return (
    <ctx.Provider value={{ onClose, titleId, setTitleId }}>
      {children}
    </ctx.Provider>
  );
};

export const useModalContext = () => {
  const context = useContext(ctx);
  if (!context) {
    throw new Error("useModalContext must be used within a ModalProvider");
  }
  return context;
};
