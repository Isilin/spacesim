import { describe, expect, it } from "vitest";
import type { Station } from "../../model/industry.js";
import type { RelationState } from "../../model/social.js";
import { emptyStationResources } from "../industry/station.js";
import {
  applyStationCredits,
  canTradeAtStation,
  resolveStationPurchase,
  resolveStationSale,
} from "./station-market.js";
import { resolvePurchase, resolveSale, TARGET_STOCK } from "./market.js";

function makeStation(overrides: Partial<Station> = {}): Station {
  return {
    id: "station-1",
    ownerId: "empire-owner",
    bodyId: "gal-0-sys-0-p1",
    systemId: "gal-0-sys-0",
    name: "Comptoir orbital",
    resources: emptyStationResources(),
    zones: [],
    zoneQueue: [],
    installations: {},
    installQueue: [],
    marketAccess: "closed",
    marketTaxRate: 0,
    ...overrides,
  };
}

describe("canTradeAtStation", () => {
  const RELATIONS: RelationState[] = ["neutral", "nap", "alliance", "war"];

  it("le propriétaire a toujours accès, même en guerre ou station fermée", () => {
    for (const relation of RELATIONS) {
      expect(canTradeAtStation("owner", "owner", "closed", relation)).toBe(
        true,
      );
    }
  });

  it("« war » bloque toujours un visiteur, quel que soit le palier", () => {
    for (const access of [
      "closed",
      "corp",
      "alliance",
      "nap",
      "public",
    ] as const) {
      expect(canTradeAtStation("owner", "visitor", access, "war")).toBe(false);
    }
  });

  it("« closed » refuse tout visiteur hors guerre", () => {
    for (const relation of RELATIONS) {
      if (relation === "war") continue;
      expect(canTradeAtStation("owner", "visitor", "closed", relation)).toBe(
        false,
      );
    }
  });

  it("« alliance » n'accepte que les alliés", () => {
    expect(canTradeAtStation("owner", "visitor", "alliance", "alliance")).toBe(
      true,
    );
    expect(canTradeAtStation("owner", "visitor", "alliance", "nap")).toBe(
      false,
    );
    expect(canTradeAtStation("owner", "visitor", "alliance", "neutral")).toBe(
      false,
    );
  });

  it("« corp » n'accepte que les associés, quelle que soit la relation", () => {
    // Palier plus restrictif qu'`alliance` : l'appartenance à une corporation est
    // exclusive alors qu'un empire peut être allié de plusieurs (ADR 0009).
    for (const relation of RELATIONS) {
      if (relation === "war") continue;
      expect(
        canTradeAtStation("owner", "visitor", "corp", relation, true),
      ).toBe(true);
      expect(
        canTradeAtStation("owner", "visitor", "corp", relation, false),
      ).toBe(false);
    }
  });

  it("un associé passe aussi les paliers plus permissifs", () => {
    // Sinon ouvrir sa station aux alliés la fermerait à ses propres associés.
    for (const access of ["alliance", "nap"] as const) {
      expect(
        canTradeAtStation("owner", "visitor", access, "neutral", true),
      ).toBe(true);
    }
  });

  it("« nap » accepte alliés et partenaires de pacte, pas les neutres", () => {
    expect(canTradeAtStation("owner", "visitor", "nap", "alliance")).toBe(true);
    expect(canTradeAtStation("owner", "visitor", "nap", "nap")).toBe(true);
    expect(canTradeAtStation("owner", "visitor", "nap", "neutral")).toBe(false);
  });

  it("« public » accepte tout le monde sauf en guerre", () => {
    expect(canTradeAtStation("owner", "visitor", "public", "neutral")).toBe(
      true,
    );
    expect(canTradeAtStation("owner", "visitor", "public", "nap")).toBe(true);
    expect(canTradeAtStation("owner", "visitor", "public", "alliance")).toBe(
      true,
    );
    expect(canTradeAtStation("owner", "visitor", "public", "war")).toBe(false);
  });
});

describe("applyStationCredits", () => {
  it("un apport est toujours intégral", () => {
    const { resources, applied } = applyStationCredits(
      { ...emptyStationResources(), credits: 10 },
      50,
    );
    expect(applied).toBe(50);
    expect(resources.credits).toBe(60);
  });

  it("un prélèvement est plafonné au disponible, jamais négatif", () => {
    const { resources, applied } = applyStationCredits(
      { ...emptyStationResources(), credits: 10 },
      -30,
    );
    expect(applied).toBe(-10);
    expect(resources.credits).toBe(0);
  });

  it("un prélèvement dans la limite du disponible passe intégralement", () => {
    const { resources, applied } = applyStationCredits(
      { ...emptyStationResources(), credits: 100 },
      -30,
    );
    expect(applied).toBe(-30);
    expect(resources.credits).toBe(70);
  });
});

describe("resolveStationSale", () => {
  it("à taxe nulle, le vendeur reçoit exactement le revenu brut (cohérent avec resolveSale)", () => {
    const station = makeStation({
      resources: {
        ...emptyStationResources(),
        credits: 100_000,
        metals: TARGET_STOCK,
      },
    });
    const cargo = { metals: 50 };
    const raw = resolveSale(station.resources, cargo);
    const { station: next, revenue } = resolveStationSale(station, cargo, 0);
    expect(revenue).toBe(raw.revenue);
    expect(next.resources.metals).toBe(raw.stocks.metals);
    expect(next.resources.credits).toBe(100_000 - raw.revenue);
  });

  it("une taxe réduit ce que touche le vendeur, le reste reste en station", () => {
    const station = makeStation({
      resources: {
        ...emptyStationResources(),
        credits: 100_000,
        metals: TARGET_STOCK,
      },
    });
    const cargo = { metals: 50 };
    const raw = resolveSale(station.resources, cargo);
    const { revenue } = resolveStationSale(station, cargo, 0.1);
    expect(revenue).toBe(Math.floor(raw.revenue * 0.9));
    expect(revenue).toBeLessThan(raw.revenue);
  });

  it("plafonne le paiement aux crédits réellement disponibles côté station", () => {
    const station = makeStation({
      resources: {
        ...emptyStationResources(),
        credits: 5,
        metals: TARGET_STOCK,
      },
    });
    const { station: next, revenue } = resolveStationSale(
      station,
      { metals: 50 },
      0,
    );
    expect(revenue).toBe(5);
    expect(next.resources.credits).toBe(0);
  });
});

describe("resolveStationPurchase", () => {
  it("à taxe nulle, cohérent avec resolvePurchase brut", () => {
    const station = makeStation({
      resources: {
        ...emptyStationResources(),
        credits: 0,
        metals: TARGET_STOCK,
      },
    });
    const raw = resolvePurchase(station.resources, "metals", 500, Infinity);
    const {
      station: next,
      bought,
      spent,
    } = resolveStationPurchase(station, "metals", 500, Infinity, 0);
    expect(bought).toBe(raw.bought);
    expect(spent).toBe(raw.spent);
    expect(next.resources.credits).toBe(spent);
  });

  it("une taxe réduit la quantité achetable pour un même budget brut", () => {
    const station = makeStation({
      resources: {
        ...emptyStationResources(),
        credits: 0,
        metals: TARGET_STOCK,
      },
    });
    const withoutTax = resolveStationPurchase(
      station,
      "metals",
      500,
      Infinity,
      0,
    );
    const withTax = resolveStationPurchase(
      station,
      "metals",
      500,
      Infinity,
      0.2,
    );
    expect(withTax.bought).toBeLessThanOrEqual(withoutTax.bought);
    expect(withTax.spent).toBeLessThanOrEqual(500);
  });

  it("tout le crédit payé par le visiteur (marché + taxe) est déposé en station", () => {
    const station = makeStation({
      resources: {
        ...emptyStationResources(),
        credits: 1000,
        metals: TARGET_STOCK,
      },
    });
    const { station: next, spent } = resolveStationPurchase(
      station,
      "metals",
      500,
      Infinity,
      0.15,
    );
    expect(next.resources.credits).toBe(1000 + spent);
  });
});
