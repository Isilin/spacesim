import { useState, type FormEvent } from "react";
import { Button, Field, Tabs } from "@spacesim/ui";
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

        <Tabs
          items={[
            { value: "login", label: "Connexion" },
            { value: "register", label: "Inscription" },
          ]}
          active={mode}
          onChange={(value) => switchMode(value as Mode)}
        />

        <Field
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field
          label="Mot de passe"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={mode === "register" ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={mode === "register" ? "8 caractères minimum." : undefined}
        />

        {mode === "register" && (
          <Field
            label="Nom de l'empire"
            type="text"
            maxLength={40}
            placeholder="Consortium d'Elyssia"
            value={empireName}
            onChange={(e) => setEmpireName(e.target.value)}
          />
        )}

        {error && <p className="auth-error">{error}</p>}

        <Button type="submit" disabled={busy} className="auth-submit">
          {busy ? "…" : mode === "login" ? "Se connecter" : "Fonder l'empire"}
        </Button>
      </form>
    </div>
  );
}
