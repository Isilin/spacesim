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

  it("content_editor n'a encore aucune action câblée", () => {
    for (const action of ADMIN_ACTIONS) {
      expect(hasPermission("content_editor", action)).toBe(false);
    }
  });
});
