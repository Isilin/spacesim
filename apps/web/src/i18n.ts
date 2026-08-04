import { createI18n } from "@spacesim/i18n-config";
import { commonEn, commonFr } from "./i18n/common.js";
import { contentEn, contentFr } from "./i18n/content.js";

const fr = {
  translation: {
    ...contentFr,
    ...commonFr,
    auth: {
      checkingSession: "Vérification de la session…",
    },
  },
};

const en = {
  translation: {
    ...contentEn,
    ...commonEn,
    auth: {
      checkingSession: "Checking session…",
    },
  },
};

export const i18n = createI18n({ fr, en });
