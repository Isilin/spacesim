import { Button } from "@spacesim/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AdminAuthView } from "./AdminAuthView.js";
import { App } from "./App.js";
import { useAdminAuth } from "./useAdminAuth.js";
import "@spacesim/ui/styles.css";
import "./styles.css";

/** Rien n'est monté tant que la session n'est pas validée par le serveur ET que le rôle
 *  n'est pas privilégié. Le check de rôle ici est de l'UX : la vraie frontière est
 *  `adminGuard` côté serveur sur chaque route `/api/admin/*`. */
function AuthGate() {
  const auth = useAdminAuth();
  if (auth.status === "loading")
    return <div className="loading">Vérification de la session…</div>;
  if (auth.status !== "authenticated" || !auth.token)
    return <AdminAuthView auth={auth} />;
  if (auth.insufficientRole) {
    return (
      <div className="auth-screen">
        <div className="auth-panel">
          <h1 className="auth-brand">SPACESIM ADMIN</h1>
          <p className="auth-error">
            Le compte {auth.email} n'a aucun privilège admin. Demandez à un
            administrateur de vous attribuer un rôle.
          </p>
          <Button
            variant="link"
            className="auth-submit"
            onClick={() => void auth.logout()}
          >
            Déconnexion
          </Button>
        </div>
      </div>
    );
  }
  // `key` : changer de compte remonte l'application à neuf.
  return <App key={auth.token} auth={auth} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate />
    </BrowserRouter>
  </StrictMode>,
);
