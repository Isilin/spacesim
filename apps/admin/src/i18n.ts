import { createI18n } from "@spacesim/i18n-config";
import { commonEn, commonFr } from "./i18n/common.js";

const fr = { translation: commonFr };
const en = { translation: commonEn };

export const i18n = createI18n({ fr, en });
