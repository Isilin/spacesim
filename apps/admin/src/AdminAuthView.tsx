import { Button, Field } from "@spacesim/ui";
import { type FormEvent, useState } from "react";
import type { AdminAuth } from "./useAdminAuth.js";

interface Props {
  auth: AdminAuth;
}

/** Écran de connexion admin : pas d'inscription ici — un rôle privilégié s'obtient par un
 *  geste manuel côté serveur (chantier 23.1), jamais par un flux libre-service. */
export function AdminAuthView({ auth }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const message = await auth.login(email, password);
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <div className="auth-screen">
      <form className="auth-panel" onSubmit={submit}>
        <h1 className="auth-brand">SPACESIM ADMIN</h1>
        <p className="muted small auth-tagline">Connexion réservée aux comptes habilités.</p>

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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="auth-error">{error}</p>}

        <Button type="submit" disabled={busy} className="auth-submit">
          {busy ? "…" : "Se connecter"}
        </Button>
      </form>
    </div>
  );
}
