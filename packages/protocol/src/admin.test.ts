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
});
