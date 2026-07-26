import { describe, expect, it } from "vitest";
import { allSystems, generateUniverse } from "../../universe.js";
import { redactUniverse } from "./fog.js";

describe("redactUniverse", () => {
  it("masque corps et ceintures des systèmes non explorés, garde nom et position", () => {
    const universe = generateUniverse("fog");
    const first = allSystems(universe)[0]!;
    const explored = new Set([first.id]);
    const redacted = redactUniverse(universe, explored);

    for (const sys of allSystems(redacted)) {
      if (sys.id === first.id) {
        expect(sys.planets.length).toBeGreaterThan(0);
      } else {
        expect(sys.planets).toHaveLength(0);
        expect(sys.belts).toHaveLength(0);
        expect(sys.name).toBeTruthy();
      }
    }
    // L'original n'est pas muté.
    expect(allSystems(universe).filter((s) => s.planets.length > 0).length).toBeGreaterThan(1);
  });
});
