import i18next, { type Resource } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

/** Langues réellement livrées (chantier 27.16). En étendre la liste suffit à activer une
 *  nouvelle locale : `createI18n` et le détecteur n'ont besoin d'aucun autre changement. */
export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** Instancie un i18next indépendant par app (web/admin) — deux apps Vite distinctes, donc
 *  deux instances, mais la même config de détection/repli via ce helper partagé. */
export function createI18n(resources: Resource) {
  const instance = i18next.createInstance();
  void instance
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: SUPPORTED_LOCALES,
      interpolation: { escapeValue: false },
    });
  return instance;
}
