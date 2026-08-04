import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogView } from "./AuditLogView.js";
import { i18n } from "./i18n.js";

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
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AuditLogView />
      </QueryClientProvider>
    </I18nextProvider>,
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
    // Texte traduit (chantier 27.18 — i18n) : interroger via la même clé que le
    // composant plutôt qu'un littéral, indépendant de la locale active en test
    // (jsdom résout `navigator.language` en `en-US`, pas le repli français).
    expect(await screen.findByText(i18n.t("auditLogView.empty"))).toBeDefined();
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
