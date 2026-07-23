import { useState, type FormEvent } from "react";
import type { Auth } from "./useAuth.js";

interface Props {
  auth: Auth;
}

type Mode = "login" | "register";

/** Écran d'accueil : connexion ou inscription. Aucun dashboard avant authentification. */
export function AuthView({ auth }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [empireName, setEmpireName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const message =
      mode === "register"
        ? await auth.register(email, password, empireName)
        : await auth.login(email, password);
    setBusy(false);
    if (message) setError(message);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="auth-screen">
      <form className="auth-panel" onSubmit={submit}>
        <h1 className="brand auth-brand">SPACESIM</h1>
        <p className="muted small auth-tagline">
          {mode === "login"
            ? "Reprenez le commandement de votre empire."
            : "Fondez un empire dans l'univers partagé."}
        </p>

        <nav className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Connexion
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Inscription
          </button>
        </nav>

        <label className="auth-field">
          <span>Adresse e-mail</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="auth-field">
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            minLength={mode === "register" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "register" && <em className="small muted">8 caractères minimum.</em>}
        </label>

        {mode === "register" && (
          <label className="auth-field">
            <span>Nom de l'empire</span>
            <input
              type="text"
              maxLength={40}
              placeholder="Consortium d'Elyssia"
              value={empireName}
              onChange={(e) => setEmpireName(e.target.value)}
            />
          </label>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button className="action-button auth-submit" type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Se connecter" : "Fonder l'empire"}
        </button>
      </form>
    </div>
  );
}
