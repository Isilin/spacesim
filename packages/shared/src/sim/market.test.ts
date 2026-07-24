import { describe, expect, it } from "vitest";
import { FACTIONS } from "../content/factions.js";
import { createRng } from "../rng.js";
import {
  BASE_PRICES,
  initialStocks,
  marketTick,
  MAX_STOCK,
  PRICE_MULT_MAX,
  PRICE_MULT_MIN,
  resolvePurchase,
  resolveSale,
  regionalMultiplier,
  stationPrice,
  TARGET_STOCK,
  type Stocks,
} from "./market.js";

function stocksAt(value: number): Stocks {
  return {
    ore: value,
    energy: value,
    food: value,
    metals: value,
    goods: value,
    components: value,
    credits: 0,
    science: 0,
  };
}

describe("stationPrice", () => {
  it("vaut le prix de base au stock cible", () => {
    expect(stationPrice("metals", TARGET_STOCK)).toBe(BASE_PRICES.metals);
  });

  it("monte quand le stock baisse, borné", () => {
    expect(stationPrice("ore", 100)).toBeGreaterThan(BASE_PRICES.ore);
    expect(stationPrice("ore", 1)).toBe(Math.round(BASE_PRICES.ore * PRICE_MULT_MAX * 100) / 100);
  });

  it("baisse quand le stock monte, borné", () => {
    expect(stationPrice("goods", MAX_STOCK)).toBeLessThan(BASE_PRICES.goods);
    expect(stationPrice("goods", MAX_STOCK * 100)).toBe(
      Math.round(BASE_PRICES.goods * PRICE_MULT_MIN * 100) / 100,
    );
  });
});

describe("marketTick", () => {
  it("est déterministe pour un même rng", () => {
    const stocks = stocksAt(TARGET_STOCK);
    const a = marketTick(stocks, FACTIONS.ferride, createRng("m1"));
    const b = marketTick(stocks, FACTIONS.ferride, createRng("m1"));
    expect(a).toEqual(b);
  });

  it("le profil de faction pousse les stocks dans le bon sens", () => {
    const stocks = stocksAt(TARGET_STOCK);
    // Moyenne sur plusieurs seeds : le bruit (±2 %) dépasse parfois un petit drift.
    let metals = 0;
    let food = 0;
    for (let i = 0; i < 20; i++) {
      const next = marketTick(stocks, FACTIONS.ferride, createRng(`m${i}`));
      metals += next.metals;
      food += next.food;
    }
    expect(metals / 20).toBeGreaterThan(TARGET_STOCK); // produit des métaux
    expect(food / 20).toBeLessThan(TARGET_STOCK); // consomme la nourriture
  });

  it("reste dans [0, MAX_STOCK]", () => {
    let stocks = stocksAt(10);
    for (let i = 0; i < 200; i++) {
      stocks = marketTick(stocks, FACTIONS.ostara_league, createRng(`x${i}`));
      for (const v of Object.values(stocks)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(MAX_STOCK);
      }
    }
  });
});

describe("resolveSale", () => {
  it("crédite au prix moyen et augmente le stock", () => {
    const { stocks, revenue } = resolveSale(stocksAt(TARGET_STOCK), { metals: 100 });
    expect(stocks.metals).toBe(TARGET_STOCK + 100);
    expect(revenue).toBeGreaterThan(0);
    expect(revenue).toBeLessThanOrEqual(100 * BASE_PRICES.metals);
  });

  it("vendre beaucoup rapporte moins par unité (anti-farm)", () => {
    const small = resolveSale(stocksAt(TARGET_STOCK), { goods: 50 }).revenue / 50;
    const big = resolveSale(stocksAt(TARGET_STOCK), { goods: 1200 }).revenue / 1200;
    expect(big).toBeLessThan(small);
  });

  it("ignore les ressources hors marché", () => {
    const { stocks, revenue } = resolveSale(stocksAt(TARGET_STOCK), { science: 100 } as never);
    expect(revenue).toBe(0);
    expect(stocks).toEqual(stocksAt(TARGET_STOCK));
  });
});

describe("resolvePurchase", () => {
  it("achète le maximum dans le budget, décrémente le stock", () => {
    const { stocks, bought, spent } = resolvePurchase(stocksAt(TARGET_STOCK), "ore", 200);
    expect(bought).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(200);
    expect(stocks.ore).toBe(TARGET_STOCK - bought);
  });

  it("borné par le stock disponible", () => {
    const { bought } = resolvePurchase(stocksAt(50), "food", 1_000_000);
    expect(bought).toBe(50);
  });

  it("budget nul ou stock vide : rien", () => {
    expect(resolvePurchase(stocksAt(TARGET_STOCK), "ore", 0).bought).toBe(0);
    expect(resolvePurchase(stocksAt(0), "ore", 1000).bought).toBe(0);
  });

  it("acheter beaucoup coûte plus cher par unité", () => {
    const small = resolvePurchase(stocksAt(TARGET_STOCK), "metals", 100);
    const big = resolvePurchase(stocksAt(TARGET_STOCK), "metals", 5000);
    expect(small.spent / small.bought).toBeLessThan(big.spent / big.bought);
  });
});

describe("initialStocks", () => {
  it("déterministe et autour de la cible", () => {
    const a = initialStocks(createRng("init"));
    const b = initialStocks(createRng("init"));
    expect(a).toEqual(b);
    expect(a.ore).toBeGreaterThanOrEqual(TARGET_STOCK * 0.6);
    expect(a.ore).toBeLessThanOrEqual(TARGET_STOCK * 1.4);
  });
});

describe("prix régionaux (chantier 12)", () => {
  const ctx = (stationId: string, galaxyIndex: number) => ({ stationId, galaxyIndex });

  it("sans contexte, le barème d'origine est inchangé", () => {
    expect(stationPrice("metals", TARGET_STOCK)).toBe(BASE_PRICES.metals);
  });

  it("deux comptoirs n'affichent pas le même prix au même stock", () => {
    const a = stationPrice("metals", TARGET_STOCK, ctx("gal-0-sys-1-st", 0));
    const b = stationPrice("metals", TARGET_STOCK, ctx("gal-0-sys-7-st", 0));
    expect(a).not.toBe(b);
  });

  it("est déterministe : même station, même prix", () => {
    const price = () => stationPrice("goods", 500, ctx("gal-2-sys-3-st", 2));
    expect(price()).toBe(price());
  });

  it("les anneaux lointains paient cher le manufacturé et bradent le brut", () => {
    const proche = ctx("comptoir", 0);
    const lointain = ctx("comptoir", 6);
    expect(stationPrice("components", 800, lointain)).toBeGreaterThan(
      stationPrice("components", 800, proche),
    );
    expect(stationPrice("ore", 800, lointain)).toBeLessThan(stationPrice("ore", 800, proche));
  });

  it("l'écart entre galaxies est assez net pour justifier un voyage", () => {
    const proche = stationPrice("components", 800, ctx("comptoir", 0));
    const lointain = stationPrice("components", 800, ctx("comptoir", 6));
    expect(lointain / proche).toBeGreaterThan(1.3);
  });

  it("le multiplicateur régional reste borné même très loin", () => {
    const mult = regionalMultiplier("components", ctx("comptoir", 500));
    expect(mult).toBeLessThan(2);
    expect(regionalMultiplier("ore", ctx("comptoir", 500))).toBeGreaterThan(0.3);
  });

  it("ventes et achats appliquent le contexte régional", () => {
    const stocks = initialStocks(() => 0.5);
    const local = resolveSale(stocks, { components: 50 }, ctx("comptoir", 0));
    const distant = resolveSale(stocks, { components: 50 }, ctx("comptoir", 6));
    expect(distant.revenue).toBeGreaterThan(local.revenue);

    const buyLocal = resolvePurchase(stocks, "components", 1000, Infinity, ctx("comptoir", 0));
    const buyDistant = resolvePurchase(stocks, "components", 1000, Infinity, ctx("comptoir", 6));
    // Plus cher au loin : le même budget achète moins.
    expect(buyDistant.bought).toBeLessThan(buyLocal.bought);
  });
});
