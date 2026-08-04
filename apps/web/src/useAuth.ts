import { useCallback, useEffect, useState } from "react";
import { i18n } from "./i18n.js";

/** Clé de persistance du jeton de session (chantier 8 — remplace le jeton de joueur 7c). */
const SESSION_KEY = "spacesim.session";

/** Identité de l'empire piloté, renvoyée par les routes `/auth/*`. */
export interface EmpireIdentity {
  id: string;
  name: string;
  color: string;
}

export interface AuthState {
  /** `loading` tant que la session persistée n'a pas été validée par le serveur. */
  status: "loading" | "anonymous" | "authenticated";
  token: string | null;
  email: string | null;
  empire: EmpireIdentity | null;
}

export interface Auth extends AuthState {
  register: (
    email: string,
    password: string,
    empireName: string,
  ) => Promise<string | null>;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  /** Retour à l'écran de connexion quand le serveur rejette la session (WS 4001). */
  sessionExpired: () => void;
}

interface AuthPayload {
  token: string;
  email: string;
  empire: EmpireIdentity | null;
}

/** Lit le corps JSON d'une réponse ; retourne le message d'erreur français du serveur. */
async function readJson<T>(
  response: Response,
): Promise<{ data: T } | { error: string }> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { error: i18n.t("useAuth.unreadableResponse") };
  }
  if (!response.ok) {
    const message = (body as { error?: string }).error;
    return { error: message ?? i18n.t("useAuth.serverError") };
  }
  return { data: body as T };
}

/**
 * Identité du joueur : session persistée en `localStorage`, revalidée au montage
 * contre `/auth/me` (une session révoquée ou expirée renvoie à l'écran de connexion).
 */
export function useAuth(): Auth {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    token: localStorage.getItem(SESSION_KEY),
    email: null,
    empire: null,
  });

  // Revalidation au montage : le jeton local ne prouve rien tant que le serveur ne l'a pas dit.
  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) {
      setState({ status: "anonymous", token: null, email: null, empire: null });
      return;
    }
    let cancelled = false;
    fetch("/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) =>
        readJson<{ email: string; empire: EmpireIdentity | null }>(response),
      )
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          localStorage.removeItem(SESSION_KEY);
          setState({
            status: "anonymous",
            token: null,
            email: null,
            empire: null,
          });
          return;
        }
        setState({
          status: "authenticated",
          token,
          email: result.data.email,
          empire: result.data.empire,
        });
      })
      .catch(() => {
        // Serveur injoignable : on garde le jeton, l'utilisateur retentera.
        if (!cancelled) setState((s) => ({ ...s, status: "anonymous" }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(
    async (
      path: string,
      body: Record<string, string>,
    ): Promise<string | null> => {
      let result: { data: AuthPayload } | { error: string };
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        result = await readJson<AuthPayload>(response);
      } catch {
        return i18n.t("useAuth.serverUnreachable");
      }
      if ("error" in result) return result.error;
      localStorage.setItem(SESSION_KEY, result.data.token);
      setState({
        status: "authenticated",
        token: result.data.token,
        email: result.data.email,
        empire: result.data.empire,
      });
      return null;
    },
    [],
  );

  const register = useCallback(
    (email: string, password: string, empireName: string) =>
      submit("/auth/register", { email, password, empireName }),
    [submit],
  );

  const login = useCallback(
    (email: string, password: string) =>
      submit("/auth/login", { email, password, locale: i18n.language }),
    [submit],
  );

  const clear = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setState({ status: "anonymous", token: null, email: null, empire: null });
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(SESSION_KEY);
    clear();
    if (!token) return;
    // Révocation au mieux : la session locale est déjà oubliée quoi qu'il arrive.
    await fetch("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }, [clear]);

  return { ...state, register, login, logout, sessionExpired: clear };
}
