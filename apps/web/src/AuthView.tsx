import { useState, type FormEvent } from "react";
import { Button, Field, Tabs } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import type { Auth } from "./useAuth.js";

interface Props {
  auth: Auth;
}

type Mode = "login" | "register";

/** Écran d'accueil : connexion ou inscription. Aucun dashboard avant authentification. */
export function AuthView({ auth }: Props) {
  const { t } = useTranslation();
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
        <h1 className="auth-brand">SPACESIM</h1>
        <p className="muted small auth-tagline">
          {mode === "login"
            ? t("authView.taglineLogin")
            : t("authView.taglineRegister")}
        </p>

        <Tabs
          items={[
            { value: "login", label: t("authView.tabLogin") },
            { value: "register", label: t("authView.tabRegister") },
          ]}
          active={mode}
          onChange={(value) => switchMode(value as Mode)}
        />

        <Field
          label={t("authView.email")}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field
          label={t("authView.password")}
          type="password"
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          required
          minLength={mode === "register" ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={mode === "register" ? t("authView.passwordHint") : undefined}
        />

        {mode === "register" && (
          <Field
            label={t("authView.empireName")}
            type="text"
            maxLength={40}
            placeholder={t("authView.empireNamePlaceholder")}
            value={empireName}
            onChange={(e) => setEmpireName(e.target.value)}
          />
        )}

        {error && <p className="auth-error">{error}</p>}

        <Button type="submit" disabled={busy} className="auth-submit">
          {busy
            ? "…"
            : mode === "login"
              ? t("authView.submitLogin")
              : t("authView.submitRegister")}
        </Button>
      </form>
    </div>
  );
}
