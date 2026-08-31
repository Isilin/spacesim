import { describe, expect, it } from "vitest";
import type { MarketOrder } from "../../model/social.js";
import { bestPrices, matchOrders } from "./order-book.js";

function order(
  over: Partial<MarketOrder> & Pick<MarketOrder, "id">,
): MarketOrder {
  return {
    stationId: "st",
    ownerId: "seller",
    side: "sell",
    resource: "metals",
    remaining: 10,
    pricePerUnit: 5,
    createdAt: 1000,
    ...over,
  } as MarketOrder;
}

const incoming = (over: Partial<Parameters<typeof matchOrders>[1]> = {}) => ({
  ownerId: "buyer",
  side: "buy" as const,
  resource: "metals",
  quantity: 10,
  pricePerUnit: 5,
  ...over,
});

describe("matchOrders — priorité et prix", () => {
  it("le meilleur prix passe en premier", () => {
    const book = [
      order({ id: "cher", pricePerUnit: 7 }),
      order({ id: "pas-cher", pricePerUnit: 4 }),
    ];
    const { fills } = matchOrders(book, incoming({ pricePerUnit: 10 }));
    expect(fills[0]!.restingOrderId).toBe("pas-cher");
  });

  it("à prix égal, le plus ancien passe en premier", () => {
    const book = [
      order({ id: "recent", createdAt: 2000 }),
      order({ id: "ancien", createdAt: 1000 }),
    ];
    const { fills } = matchOrders(book, incoming());
    expect(fills[0]!.restingOrderId).toBe("ancien");
  });

  it("deux ordres de la même milliseconde s'apparient dans un ordre stable", () => {
    // Sans départage par identifiant, deux serveurs rejouant le même journal
    // divergeraient.
    const book = [
      order({ id: "b", createdAt: 1000 }),
      order({ id: "a", createdAt: 1000 }),
    ];
    expect(matchOrders(book, incoming()).fills[0]!.restingOrderId).toBe("a");
    expect(
      matchOrders([...book].reverse(), incoming()).fills[0]!.restingOrderId,
    ).toBe("a");
  });

  it("le prix retenu est celui de l'ordre AU REPOS", () => {
    // Apparier au prix de l'entrant punirait le fait d'afficher un prix et d'attendre —
    // exactement le comportement qu'on veut encourager (ADR 0012).
    const book = [order({ id: "repos", pricePerUnit: 4 })];
    const { fills } = matchOrders(book, incoming({ pricePerUnit: 9 }));
    expect(fills[0]!.pricePerUnit).toBe(4);
  });
});

describe("matchOrders — conditions de croisement", () => {
  it("un achat n'accepte pas plus cher que sa limite", () => {
    const book = [order({ id: "trop-cher", pricePerUnit: 6 })];
    const { fills, remaining } = matchOrders(
      book,
      incoming({ pricePerUnit: 5 }),
    );
    expect(fills).toHaveLength(0);
    expect(remaining).toBe(10);
  });

  it("une vente n'accepte pas moins que sa limite", () => {
    const book = [
      order({ id: "offre-basse", side: "buy", ownerId: "b", pricePerUnit: 3 }),
    ];
    const { fills } = matchOrders(
      book,
      incoming({ side: "sell", ownerId: "s", pricePerUnit: 5 }),
    );
    expect(fills).toHaveLength(0);
  });

  it("une autre ressource n'est jamais appariée", () => {
    const book = [order({ id: "x", resource: "food" })];
    expect(matchOrders(book, incoming()).fills).toHaveLength(0);
  });

  it("on ne s'apparie pas à soi-même", () => {
    // Un aller-retour gratuit fabriquerait du volume sans rien échanger.
    const book = [order({ id: "mien", ownerId: "buyer" })];
    expect(matchOrders(book, incoming()).fills).toHaveLength(0);
  });
});

describe("matchOrders — quantités", () => {
  it("l'ordre entrant se répartit sur plusieurs contreparties", () => {
    const book = [
      order({ id: "a", remaining: 3, pricePerUnit: 4 }),
      order({ id: "b", remaining: 4, pricePerUnit: 5 }),
    ];
    const { fills, remaining } = matchOrders(
      book,
      incoming({ quantity: 10, pricePerUnit: 6 }),
    );
    expect(fills.map((f) => f.quantity)).toEqual([3, 4]);
    // Ce qui reste rejoint le carnet : un ordre limite n'est pas annulé faute de
    // contrepartie.
    expect(remaining).toBe(3);
  });

  it("aucune exécution ne dépasse ce que la contrepartie offre", () => {
    const book = [order({ id: "a", remaining: 2 })];
    const { fills } = matchOrders(book, incoming({ quantity: 100 }));
    expect(fills[0]!.quantity).toBe(2);
  });

  it("un ordre épuisé est ignoré", () => {
    const book = [order({ id: "vide", remaining: 0 })];
    expect(matchOrders(book, incoming()).fills).toHaveLength(0);
  });

  it("la somme des exécutions plus le reste vaut la quantité demandée", () => {
    // L'invariant qui empêche de créer ou de détruire de la marchandise.
    const book = [
      order({ id: "a", remaining: 3 }),
      order({ id: "b", remaining: 5 }),
    ];
    const { fills, remaining } = matchOrders(book, incoming({ quantity: 12 }));
    const filled = fills.reduce((s, f) => s + f.quantity, 0);
    expect(filled + remaining).toBe(12);
  });
});

describe("bestPrices", () => {
  it("rend le meilleur de chaque côté", () => {
    const book = [
      order({ id: "s1", pricePerUnit: 8 }),
      order({ id: "s2", pricePerUnit: 6 }),
      order({ id: "b1", side: "buy", ownerId: "b", pricePerUnit: 3 }),
      order({ id: "b2", side: "buy", ownerId: "b", pricePerUnit: 5 }),
    ];
    expect(bestPrices(book, "metals")).toEqual({ bid: 5, ask: 6 });
  });

  it("un côté vide vaut `null`, pas zéro", () => {
    // Un carnet à moitié vide est un état normal ; l'afficher à 0 mentirait.
    expect(bestPrices([order({ id: "s" })], "metals").bid).toBeNull();
    expect(bestPrices([], "metals")).toEqual({ bid: null, ask: null });
  });
});
