import { beforeEach, describe, expect, it } from "vitest";
import { zoneColorToken } from "../zonePalette.js";
import { resetThemeCache, slotColor, themeColor, zoneColor } from "./theme.js";

beforeEach(resetThemeCache);

/**
 * Sous Vitest, `tokens.css` n'est jamais chargée : `getComputedStyle` rend une chaîne vide
 * et le chemin de repli est le chemin NORMAL. C'est voulu — c'est ce qui rend ce module
 * testable sans feuille de style, comme `bounds.ts` l'est sans navigateur.
 */
describe("themeColor", () => {
  it("retombe sur la valeur littérale quand le jeton n'est pas résolu", () => {
    expect(themeColor("--inexistant", "#123456")).toBe("#123456");
  });

  it("refuse une valeur qui n'est pas un hexadécimal", () => {
    // `getPropertyValue` rend la valeur BRUTE d'une custom property, sans la substituer :
    // un jeton défini comme `var(--ko)` ou `color-mix(…)` reviendrait tel quel, et
    // `THREE.Color` ne sait pas le lire.
    document.documentElement.style.setProperty("--test-alias", "var(--ko)");
    expect(themeColor("--test-alias", "#abcdef")).toBe("#abcdef");
    document.documentElement.style.removeProperty("--test-alias");
  });

  it("lit un jeton hexadécimal réellement posé", () => {
    document.documentElement.style.setProperty("--test-hex", "#0f0f0f");
    expect(themeColor("--test-hex", "#ffffff")).toBe("#0f0f0f");
    document.documentElement.style.removeProperty("--test-hex");
  });

  it("met en cache, et `resetThemeCache` relit", () => {
    document.documentElement.style.setProperty("--test-cache", "#111111");
    expect(themeColor("--test-cache", "#ffffff")).toBe("#111111");
    document.documentElement.style.setProperty("--test-cache", "#222222");
    // Toujours l'ancienne : `getComputedStyle` force un recalcul de style, on ne le paie
    // pas par pièce et par image pour une valeur qui ne bouge pas.
    expect(themeColor("--test-cache", "#ffffff")).toBe("#111111");
    resetThemeCache();
    expect(themeColor("--test-cache", "#ffffff")).toBe("#222222");
    document.documentElement.style.removeProperty("--test-cache");
  });
});

describe("slotColor", () => {
  it("rend un hexadécimal pour chacun des quatre types d'emplacement", () => {
    for (const slot of ["weapon", "defense", "propulsion", "utility"]) {
      expect(slotColor(slot)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("les quatre types se distinguent", () => {
    const colors = ["weapon", "defense", "propulsion", "utility"].map(
      slotColor,
    );
    expect(new Set(colors).size).toBe(4);
  });

  it("un type inconnu reste visible plutôt que de disparaître", () => {
    // Repli générique obligatoire (ADR 0007).
    expect(slotColor("téléportation")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("zoneColor", () => {
  it("suit le MÊME hachage que le diagramme 2D", () => {
    // Les deux vues de la même station sont l'une au-dessus de l'autre : elles ne peuvent
    // pas colorer une zone différemment.
    for (const id of [
      "industrial_zone",
      "science_zone",
      "military_zone",
      "commercial_zone",
    ]) {
      expect(zoneColorToken(id)).toMatch(/^--/);
      expect(zoneColor(id)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("colore une zone inventée par un administrateur, sans la griser", () => {
    // Ces ids sont libres côté base (chantier 23) — c'est toute la raison du hachage.
    expect(zoneColor("zone_de_plaisance")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
