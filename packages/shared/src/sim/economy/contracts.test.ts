import { describe, expect, it } from "vitest";
import type { Contract } from "../../model/social.js";
import {
  CONTRACT_MAX_DURATION_MS,
  CONTRACT_MIN_DURATION_MS,
  clampContractDuration,
  contractAcceptable,
  contractEscrow,
  contractPayout,
  isContractExpired,
} from "./contracts.js";

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "contract-1",
    issuerId: "empire-1",
    issuerName: "Colonia",
    issuerColor: "#fff",
    colonyId: "colony-1",
    colonyName: "Alpha",
    systemId: "gal-0-sys-0",
    resource: "metals",
    quantity: 100,
    remaining: 100,
    pricePerUnit: 4,
    createdAt: 0,
    deadline: 100_000,
    status: "open",
    ...overrides,
  };
}

describe("clampContractDuration", () => {
  it("laisse passer une durée dans les bornes", () => {
    expect(clampContractDuration(3_600_000)).toBe(3_600_000);
  });
  it("relève une durée trop courte au minimum", () => {
    expect(clampContractDuration(1000)).toBe(CONTRACT_MIN_DURATION_MS);
  });
  it("plafonne une durée trop longue au maximum", () => {
    expect(clampContractDuration(999_999_999)).toBe(CONTRACT_MAX_DURATION_MS);
  });
});

describe("contractEscrow / contractPayout", () => {
  it("arrondit le séquestre au supérieur", () => {
    expect(contractEscrow(3, 1.1)).toBe(4);
  });
  it("arrondit le paiement à l'inférieur", () => {
    expect(contractPayout(makeContract({ pricePerUnit: 1.9 }), 3)).toBe(5);
  });
});

describe("isContractExpired", () => {
  it("pas expiré avant l'échéance", () => {
    expect(isContractExpired(makeContract({ deadline: 1000 }), 999)).toBe(
      false,
    );
  });
  it("expiré à l'échéance ou après", () => {
    expect(isContractExpired(makeContract({ deadline: 1000 }), 1000)).toBe(
      true,
    );
    expect(isContractExpired(makeContract({ deadline: 1000 }), 1001)).toBe(
      true,
    );
  });
});

describe("contractAcceptable", () => {
  it("acceptable si ouvert, non expiré, quantité valide", () => {
    expect(contractAcceptable(makeContract(), 50, 0)).toBe(true);
  });
  it("refuse au-delà du reliquat", () => {
    expect(contractAcceptable(makeContract({ remaining: 10 }), 50, 0)).toBe(
      false,
    );
  });
  it("refuse une quantité nulle ou négative", () => {
    expect(contractAcceptable(makeContract(), 0, 0)).toBe(false);
    expect(contractAcceptable(makeContract(), -5, 0)).toBe(false);
  });
  it("refuse un contrat non ouvert", () => {
    expect(
      contractAcceptable(makeContract({ status: "fulfilled" }), 10, 0),
    ).toBe(false);
  });
  it("refuse un contrat expiré", () => {
    expect(contractAcceptable(makeContract({ deadline: 100 }), 10, 200)).toBe(
      false,
    );
  });
});
