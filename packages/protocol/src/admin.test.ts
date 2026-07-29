import { describe, expect, it } from "vitest";
import { ADMIN_ACTIONS, hasPermission, ROLE_IDS, ROLE_PERMISSIONS } from "./admin.js";

describe("rôles et permissions admin", () => {
  it("player n'a jamais aucune action admin", () => {
    for (const action of ADMIN_ACTIONS) {
      expect(hasPermission("player", action)).toBe(false);
    }
  });

  it("admin a systématiquement toutes les actions déclarées", () => {
    for (const action of ADMIN_ACTIONS) {
      expect(hasPermission("admin", action)).toBe(true);
    }
  });

  it("chaque rôle a un ensemble de permissions défini", () => {
    for (const role of ROLE_IDS) {
      expect(ROLE_PERMISSIONS[role]).toBeInstanceOf(Set);
    }
  });

  it("une action inconnue n'est jamais autorisée, même pour admin", () => {
    expect(hasPermission("admin", "not.a.real.action" as never)).toBe(false);
  });

  it("moderator voit les comptes (chantier 23.3) mais pas le journal d'audit", () => {
    expect(hasPermission("moderator", "account.view")).toBe(true);
    expect(hasPermission("moderator", "audit.read")).toBe(false);
  });

  it("content_editor édite les vaisseaux de guerre (chantier 23.5) mais pas les comptes", () => {
    expect(hasPermission("content_editor", "content.warships.read")).toBe(true);
    expect(hasPermission("content_editor", "content.warships.write")).toBe(true);
    expect(hasPermission("content_editor", "account.view")).toBe(false);
    expect(hasPermission("content_editor", "audit.read")).toBe(false);
  });

  it("content_editor édite aussi les factions (chantier 23.6)", () => {
    expect(hasPermission("content_editor", "content.factions.read")).toBe(true);
    expect(hasPermission("content_editor", "content.factions.write")).toBe(true);
  });

  it("content_editor édite aussi les bâtiments (chantier 23.7)", () => {
    expect(hasPermission("content_editor", "content.buildings.read")).toBe(true);
    expect(hasPermission("content_editor", "content.buildings.write")).toBe(true);
  });

  it("content_editor édite aussi les vaisseaux civils (chantier 23.8)", () => {
    expect(hasPermission("content_editor", "content.ships.read")).toBe(true);
    expect(hasPermission("content_editor", "content.ships.write")).toBe(true);
  });

  it("content_editor édite aussi les constantes d'équilibrage (chantier 23.8)", () => {
    expect(hasPermission("content_editor", "content.constants.read")).toBe(true);
    expect(hasPermission("content_editor", "content.constants.write")).toBe(true);
  });

  it("content_editor édite aussi l'arbre de recherche (chantier 23.9)", () => {
    expect(hasPermission("content_editor", "content.techs.read")).toBe(true);
    expect(hasPermission("content_editor", "content.techs.write")).toBe(true);
  });

  it("content_editor édite aussi châssis et modules (chantier 23.10)", () => {
    expect(hasPermission("content_editor", "content.chassis.read")).toBe(true);
    expect(hasPermission("content_editor", "content.chassis.write")).toBe(true);
    expect(hasPermission("content_editor", "content.modules.read")).toBe(true);
    expect(hasPermission("content_editor", "content.modules.write")).toBe(true);
  });

  it("content_editor édite aussi presets et jalons (chantier 23.11)", () => {
    expect(hasPermission("content_editor", "content.presets.read")).toBe(true);
    expect(hasPermission("content_editor", "content.presets.write")).toBe(true);
    expect(hasPermission("content_editor", "content.milestones.read")).toBe(true);
    expect(hasPermission("content_editor", "content.milestones.write")).toBe(true);
  });

  it("seul admin voit le tableau de bord ops (chantier 23.12)", () => {
    expect(hasPermission("admin", "ops.read")).toBe(true);
    expect(hasPermission("moderator", "ops.read")).toBe(false);
    expect(hasPermission("content_editor", "ops.read")).toBe(false);
    expect(hasPermission("player", "ops.read")).toBe(false);
  });
});
