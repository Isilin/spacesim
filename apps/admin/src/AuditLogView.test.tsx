import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogView } from "./AuditLogView.js";

function mockFetch(body: unknown, status = 200) {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

/** Un QueryClient neuf par test — sans retry (sinon une 403 réessaierait avant que
 *  l'assertion ne s'exécute) et sans cache partagé entre tests (même requête, même clé). */
function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogView />
    </QueryClientProvider>,
  );
}

describe("AuditLogView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("affiche un état vide quand le journal est vide", async () => {
    mockFetch({ entries: [] });
    renderView();
    expect(await screen.findByText("Aucune action journalisée.")).toBeDefined();
  });

  it("affiche les entrées reçues, envoie le jeton stocké en Authorization", async () => {
    localStorage.setItem("spacesim.admin.session", "tok-secret");
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
    renderView();
    expect(await screen.findByText("admin@exemple.fr")).toBeDefined();
    expect(screen.getByText("audit.read")).toBeDefined();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/audit",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok-secret",
        }),
      }),
    );
  });

  it("affiche l'erreur renvoyée par le serveur (403)", async () => {
    mockFetch({ error: "Action non autorisée pour ce rôle" }, 403);
    renderView();
    expect(
      await screen.findByText("Action non autorisée pour ce rôle"),
    ).toBeDefined();
  });
});
