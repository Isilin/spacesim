import { Button } from "@spacesim/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AdminAuthView } from "./AdminAuthView.js";
import { App } from "./App.js";
import { useAdminAuth } from "./useAdminAuth.js";
import "@spacesim/ui/styles.css";
import "./styles.css";

/** Un seul client pour toute l'app (chantier 27.15) — pas de config par écran. Retries
 *  désactivés : une erreur 4xx (403/404/400, la grande majorité de nos erreurs API) ne
 *  se résout jamais en réessayant, et customFetch (src/api/mutator.ts) ne distingue pas
 *  encore les statuts entre eux. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
