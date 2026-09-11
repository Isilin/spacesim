import { useSyncExternalStore } from "react";

/** Le réglage système « réduire les animations ». */
const QUERY = "(prefers-reduced-motion: reduce)";

function canQuery(): boolean {
  return (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
  );
}

function subscribe(onChange: () => void): () => void {
  // Sans `matchMedia` — jsdom n'en a pas —, le réglage ne change jamais, et « non » est la
  // bonne réponse : personne n'a demandé moins de mouvement.
  if (!canQuery()) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function reducedNow(): boolean {
  return canQuery() && window.matchMedia(QUERY).matches;
}

/**
 * Le joueur a-t-il demandé moins de mouvement ? (chantier 50.13)
 *
 * La carte ne respectait ce réglage nulle part, défaut consigné depuis le chantier 34 ; le
 * chantier 50 y met du mouvement partout, et ne pouvait pas le doubler de volume.
 *
 * Lu par chaque composant qui anime, plutôt que descendu par une prop à travers toute la
 * scène : une souscription de plus ne coûte qu'un écouteur. Suivi en direct — changer le
 * réglage système se voit sans recharger la page.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedNow, () => false);
}
