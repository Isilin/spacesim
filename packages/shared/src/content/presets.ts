import type { ChassisId } from "./chassis.js";
import type { ModuleId } from "./modules.js";

/**
 * Plans pré-conçus (chantier 13). Servent de base d'amorçage pour un nouvel empire,
 * de catalogue de référence dans le concepteur, de designs vendus par les comptoirs PNJ
 * et de flottes pour les PNJ (pirates). Ils prouvent aussi que le langage châssis+modules
 * couvre les rôles historiques (cargo, chasseur, croiseur, cuirassé, minier, colonial).
 */
export interface PresetDef {
  id: string;
  name: string;
  chassisId: ChassisId;
  modules: ModuleId[];
}

export const PRESETS: PresetDef[] = [
  // ── Disponibles d'emblée (châssis + modules de base) ──
  {
    id: "interceptor",
    name: "Intercepteur",
    chassisId: "scout_frame",
    modules: ["laser_pulse", "armor_plating", "ion_thruster", "cargo_pod"],
  },
  {
    id: "freighter_mk1",
    name: "Cargo léger",
    chassisId: "light_freighter",
    modules: ["cargo_pod", "cargo_pod", "ion_thruster"],
  },
  // ── Débloqués par la recherche ──
  {
    id: "gunship",
    name: "Canonnière",
    chassisId: "standard_hull",
    modules: [
      "laser_pulse",
      "laser_pulse",
      "deflector_shield",
      "armor_plating",
      "ion_thruster",
      "cargo_pod",
      "cargo_pod",
    ],
  },
  {
    id: "cruiser_mk1",
    name: "Croiseur de ligne",
    chassisId: "warframe",
    modules: [
      "railgun",
      "railgun",
      "laser_pulse",
      "aegis_shield",
      "deflector_shield",
      "warp_drive",
      "fleet_uplink",
    ],
  },
  {
    id: "dread_mk1",
    name: "Cuirassé",
    chassisId: "battlecruiser",
    modules: [
      "railgun",
      "railgun",
      "missile_battery",
      "missile_battery",
      "aegis_shield",
      "aegis_shield",
      "armor_plating",
      "warp_drive",
      "fleet_uplink",
      "cargo_pod",
    ],
  },
  {
    id: "prospector",
    name: "Foreuse",
    chassisId: "mining_barge",
    modules: ["mining_laser", "mining_laser", "mining_laser", "ion_thruster", "armor_plating"],
  },
  {
    id: "settler",
    name: "Vaisseau colonial",
    chassisId: "colony_ark",
    modules: ["habitat_pod", "cargo_pod", "cargo_pod", "ion_thruster", "armor_plating"],
  },
  {
    id: "clipper",
    name: "Clipper lourd",
    chassisId: "heavy_freighter",
    modules: ["cargo_hold_xl", "cargo_hold_xl", "cargo_pod", "cargo_pod", "ramscoop"],
  },
];

/** Plans copiés dans un empire neuf (constructibles d'emblée). */
export const STARTER_PRESET_IDS: readonly string[] = ["interceptor", "freighter_mk1"];

export function presetById(id: string): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id);
}
