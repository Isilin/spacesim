import { createI18n } from "@spacesim/i18n-config";

const fr = {
  translation: {
    auth: {
      checkingSession: "Vérification de la session…",
    },
  },
};

const en = {
  translation: {
    auth: {
      checkingSession: "Checking session…",
    },
  },
};

export const i18n = createI18n({ fr, en });
