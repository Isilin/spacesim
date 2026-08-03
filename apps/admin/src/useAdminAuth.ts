import type { RoleId } from "@spacesim/protocol";
import { useCallback, useEffect, useState } from "react";

/** Clé distincte de `spacesim.session` (apps/web) — deux origines différentes en dev
 *  (ports 5173/5174) n'ont de toute façon pas le même `localStorage`, mais un nom explicite
 *  évite toute ambiguïté si les deux clients finissent un jour sur la même origine en prod. */
const SESSION_KEY = "spacesim.admin.session";

export interface AdminAuthState {
  /** `loading` tant que la session persistée n'a pas été validée par le serveur. */
  status: "loading" | "anonymous" | "authenticated";
  token: string | null;
  email: string | null;
  role: RoleId | null;
}

export interface AdminAuth extends AdminAuthState {
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  /** Un compte valide mais sans privilège admin (rôle "player") — vérif UX uniquement, la
   *  vraie frontière est le garde serveur sur chaque route `/api/admin/*`. */
  insufficientRole: boolean;
}

interface AuthPayload {
  token: string;
  email: string;
  role: RoleId;
}

/** Lit le corps JSON d'une réponse ; retourne le message d'erreur français du serveur. */
async function readJson<T>(
  response: Response,
): Promise<{ data: T } | { error: string }> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { error: "Réponse illisible du serveur" };
  }
  if (!response.ok) {
    const message = (body as { error?: string }).error;
    return { error: message ?? "Erreur serveur" };
  }
  return { data: body as T };
}

/**
 * Identité de l'opérateur admin : même mécanisme que `apps/web/src/useAuth.ts`
 * (session opaque en `localStorage`, revalidée au montage contre `/auth/me`) — un compte
 * admin reste un compte joueur normal, juste promu par `accounts.role` (chantier 23.1).
 * Pas de flux d'inscription ici : un rôle privilégié s'obtient par un geste manuel, jamais
 * via ce client.
 */
export function useAdminAuth(): AdminAuth {
  const [state, setState] = useState<AdminAuthState>({
    status: "loading",
    token: localStorage.getItem(SESSION_KEY),
    email: null,
    role: null,
  });

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) {
      setState({ status: "anonymous", token: null, email: null, role: null });
      return;
    }
    let cancelled = false;
    fetch("/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => readJson<{ email: string; role: RoleId }>(response))
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          localStorage.removeItem(SESSION_KEY);
          setState({
            status: "anonymous",
            token: null,
            email: null,
            role: null,
          });
          return;
        }
        setState({
          status: "authenticated",
          token,
          email: result.data.email,
          role: result.data.role,
        });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, status: "anonymous" }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      let result: { data: AuthPayload } | { error: string };
      try {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        result = await readJson<AuthPayload>(response);
      } catch {
        return "Serveur injoignable";
      }
      if ("error" in result) return result.error;
      localStorage.setItem(SESSION_KEY, result.data.token);
      setState({
        status: "authenticated",
        token: result.data.token,
        email: result.data.email,
        role: result.data.role,
      });
      return null;
    },
    [],
  );

  const logout = useCallback(async () => {
    const token = localStorage.getItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    setState({ status: "anonymous", token: null, email: null, role: null });
    if (!token) return;
    await fetch("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }, []);

  return {
    ...state,
    login,
    logout,
    insufficientRole:
      state.status === "authenticated" && state.role === "player",
  };
}
