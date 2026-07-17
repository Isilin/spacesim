export type MilestoneMetric = "population" | "colonies" | "explored" | "techs";

export interface MilestoneDef {
  id: string;
  metric: MilestoneMetric;
  threshold: number;
}

/** Paliers sandbox affichés sur l'écran Empire — sert aussi d'onboarding implicite. */
export const MILESTONES: MilestoneDef[] = [
  { id: "pop-25", metric: "population", threshold: 25 },
  { id: "pop-100", metric: "population", threshold: 100 },
  { id: "pop-500", metric: "population", threshold: 500 },
  { id: "pop-2000", metric: "population", threshold: 2000 },
  { id: "col-2", metric: "colonies", threshold: 2 },
  { id: "col-4", metric: "colonies", threshold: 4 },
  { id: "col-8", metric: "colonies", threshold: 8 },
  { id: "exp-3", metric: "explored", threshold: 3 },
  { id: "exp-8", metric: "explored", threshold: 8 },
  { id: "exp-20", metric: "explored", threshold: 20 },
  { id: "tech-3", metric: "techs", threshold: 3 },
  { id: "tech-9", metric: "techs", threshold: 9 },
  { id: "tech-18", metric: "techs", threshold: 18 },
];
