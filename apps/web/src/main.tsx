import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { AuthView } from "./AuthView.js";
import { useAuth } from "./useAuth.js";
import "@spacesim/ui/styles.css";
import "./styles.css";

/** Rien du jeu n'est monté tant que la session n'est pas validée par le serveur. */
function AuthGate() {
  const auth = useAuth();
  if (auth.status === "loading") return <div className="loading">Vérification de la session…</div>;
  if (auth.status !== "authenticated" || !auth.token) return <AuthView auth={auth} />;
  // `key` : changer de compte remonte l'application à neuf (aucun état de jeu résiduel).
  return <App key={auth.token} auth={auth} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate />
    </BrowserRouter>
  </StrictMode>,
);
