import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogView } from "./AuditLogView.js";

function mockFetch(body: unknown, status = 200) {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("AuditLogView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche un état vide quand le journal est vide", async () => {
    mockFetch({ entries: [] });
    render(<AuditLogView token="tok" />);
    expect(await screen.findByText("Aucune action journalisée.")).toBeDefined();
  });

  it("affiche les entrées reçues, envoie le jeton en Authorization", async () => {
    mockFetch({
      entries: [
        {
          id: "1",
          actorEmail: "admin@exemple.fr",
          action: "audit.read",
          targetType: null,
          targetId: null,
          reason: null,
          createdAt: Date.now(),
        },
      ],
    });
    render(<AuditLogView token="tok-secret" />);
    expect(await screen.findByText("admin@exemple.fr")).toBeDefined();
    expect(screen.getByText("audit.read")).toBeDefined();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/audit",
      expect.objectContaining({ headers: { Authorization: "Bearer tok-secret" } }),
    );
  });

  it("affiche l'erreur renvoyée par le serveur (403)", async () => {
    mockFetch({ error: "Action non autorisée pour ce rôle" }, 403);
    render(<AuditLogView token="tok" />);
    expect(await screen.findByText("Action non autorisée pour ce rôle")).toBeDefined();
  });
});
