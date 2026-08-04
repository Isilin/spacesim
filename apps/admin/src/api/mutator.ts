/** Même clé que useAdminAuth.ts — un compte admin est un compte joueur promu, session
 *  distincte de celle d'apps/web. */
const SESSION_KEY = "spacesim.admin.session";

/** Mutateur fetch pour le client orval (chantier 27.8b) : attache le jeton de session,
 *  lève sur une réponse non-2xx avec le message d'erreur du serveur ({ error: string }).
 *  Requêtes en chemin relatif — le proxy Vite (`/api/admin`, `/auth`) route déjà vers le
 *  serveur, même mécanisme que le reste de l'app. */
export async function customFetch<T>(
  url: string,
  options: RequestInit,
): Promise<T> {
  const token = localStorage.getItem(SESSION_KEY);
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error: res.statusText }) as { error?: string });
    throw new Error(body.error ?? `Requête échouée (${res.status})`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
