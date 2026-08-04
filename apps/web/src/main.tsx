import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { AuthView } from "./AuthView.js";
import { i18n } from "./i18n.js";
import { useAuth } from "./useAuth.js";
import "@spacesim/ui/styles.css";
import "./styles.css";

// `<html lang>` suit la locale active plutôt que le "fr" en dur d'index.html (chantier 27.16).
document.documentElement.lang = i18n.language;
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

/** Rien du jeu n'est monté tant que la session n'est pas validée par le serveur. */
function AuthGate() {
  const auth = useAuth();
  const { t } = useTranslation();
  if (auth.status === "loading")
    return <div className="loading">{t("auth.checkingSession")}</div>;
  if (auth.status !== "authenticated" || !auth.token)
    return <AuthView auth={auth} />;
  // `key` : changer de compte remonte l'application à neuf (aucun état de jeu résiduel).
  return <App key={auth.token} auth={auth} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </I18nextProvider>
  </StrictMode>,
);
