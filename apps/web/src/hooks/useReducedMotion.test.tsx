import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Le réglage « réduire les animations » (chantier 50.13). jsdom n'implémente pas
 * `matchMedia` : c'est à la fois le cas par défaut, et ce qui permet de le simuler ici.
 */
describe("useReducedMotion", () => {
  afterEach(() => {
    // Rendre la fenêtre telle qu'on l'a trouvée : sans `matchMedia`.
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("sans matchMedia, personne n'a demandé moins de mouvement", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("suit le réglage système, y compris quand il change en cours de partie", () => {
    let matches = false;
    const listeners = new Set<() => void>();
    window.matchMedia = ((media: string) => ({
      media,
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    })) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      for (const listener of listeners) listener();
    });
    expect(result.current).toBe(true);
  });
});
