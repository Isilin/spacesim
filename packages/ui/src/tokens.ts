/**
 * Miroir TypeScript des couleurs principales de tokens.css (chantier 21).
 * Utile aux calculs de couleur faits en JS/SVG dans apps/web (ex. teinte dynamique
 * par empire sur les cartes) qui ne peuvent pas lire une custom property CSS.
 * Garder synchronisé avec les valeurs `--*` de ./tokens.css.
 */
export const colors = {
  bg: "#080b10",
  bg2: "#0d131c",
  panel: "#111a26",
  panel2: "#152233",
  border: "#22384c",
  borderBright: "#2f5670",
  text: "#cdd9e6",
  muted: "#5d7590",
  dim: "#3a4c60",
  cyan: "#4fd8ff",
  cyanDim: "#1c5a70",
  cyanBg: "#0f2836",
  violet: "#b98bff",
  violetDim: "#4a3670",
  violetBg: "#211a34",
  amber: "#ffb04f",
  amberDim: "#6b4a1c",
  amberBg: "#2a1d0d",
  ok: "#5ee08a",
  okBg: "#0f2a1c",
  ko: "#ff5f5f",
  koBg: "#2c1315",
} as const;

export type ColorToken = keyof typeof colors;
