export const RESOURCES = [
  "energy",
  "ore",
  "metals",
  "components",
  "food",
  "goods",
  "credits",
  "science",
] as const;

export type ResourceId = (typeof RESOURCES)[number];
