import {
  JUMP_REFERENCE_LENGTH,
  type Colony,
  type Galaxy,
  type Relation,
  type Territory,
  type ClientUniverse,
} from "@spacesim/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransferPanel } from "./TransferPanel.js";

const R = JUMP_REFERENCE_LENGTH;

/**
 * Deux routes de « depart » vers « arrivee » : la directe traverse `milieu`, la
 * dérivation passe par `contour`. Rendre `milieu` hostile doit faire apparaître un
 * choix — et seulement dans ce cas.
 */
function galaxy(): Galaxy {
  const at = (id: string, x: number, z = 0) => ({
    id,
    name: id,
    x,
    y: 0,
    z,
    planets: [
      {
        id: `${id}-p1`,
        systemId: id,
        name: `${id} I`,
        kind: "planet" as const,
        type: "telluric" as const,
        habitability: 60,
        slots: 8,
        deposits: {},
        orbitRadius: 100,
        orbitAngle: 0,
        inclination: 0,
        ascendingNode: 0,
      },
    ],
    belts: [],
  });
  return {
    id: "gal-0",
    name: "gal-0",
    x: 0,
    y: 0,
    z: 0,
    systems: [
      at("depart", 0),
      at("milieu", R),
      at("arrivee", 2 * R),
      at("contour", 0, 2 * R),
    ],
    links: [
      ["depart", "milieu"],
      ["milieu", "arrivee"],
      ["depart", "contour"],
      ["contour", "arrivee"],
    ],
    anchorSystemId: "depart",
    depositBonus: 1,
  };
}

const universe: ClientUniverse = { galaxies: [galaxy()] };

function colony(id: string, planetId: string): Colony {
  return {
    id,
    name: id,
    planetId,
    resources: {},
    orbitalResources: { ore: 500, energy: 500 },
    shipsBusy: [],
    ships: { cargo_small: 2 },
    liftRules: {},
  } as unknown as Colony;
}

function renderPanel(over: {
  territories?: Territory[];
  relations?: Relation[];
}) {
  const send = vi.fn();
  render(
    <TransferPanel
      colony={colony("c1", "depart-p1")}
      colonies={[colony("c1", "depart-p1"), colony("c2", "arrivee-p1")]}
      transfers={[]}
      universe={universe}
      transferSpeedMult={1}
      routes={[]}
      portalLinks={[]}
      territories={over.territories ?? []}
      relations={over.relations ?? []}
      empireId="moi"
      now={0}
      send={send}
    />,
  );
  return send;
}

/**
 * Les requêtes passent par les rôles et les VALEURS d'option, jamais par le texte
 * traduit : la locale active en test n'est pas le français (chantier 27.17), et une
 * requête sur un libellé traduit passerait à côté sans échouer franchement.
 * Deux listes déroulantes au plus : la destination, puis l'itinéraire.
 */
const pickers = () => screen.getAllByRole("combobox");

// Le nettoyage n'est pas automatique ici : sans lui, les rendus s'accumulent dans le
// même DOM et les comptages d'éléments deviennent faux d'un test à l'autre.
afterEach(cleanup);

describe("TransferPanel — choix d'itinéraire (chantier 31.10)", () => {
  it("n'affiche aucun sélecteur quand un seul itinéraire est pertinent", () => {
    // Sans territoire hostile ni portail, les trois critères convergent : proposer un
    // choix serait un faux choix. Seule la destination reste sélectionnable.
    renderPanel({});
    expect(pickers()).toHaveLength(1);
  });

  it("propose un contournement quand la route directe traverse un territoire ennemi", async () => {
    renderPanel({
      territories: [
        { systemId: "milieu", ownerId: "ennemi", ownerColor: "#f00" },
      ],
      relations: [
        {
          empireA: "moi",
          empireB: "ennemi",
          state: "war",
          since: 0,
          until: null,
        },
      ],
    });
    expect(pickers()).toHaveLength(2);
    const values = [...pickers()[1]!.querySelectorAll("option")].map(
      (o) => o.value,
    );
    expect(values).toEqual(["cheapest", "safest"]);
  });

  it("une simple paix ne déclenche pas de contournement", () => {
    // Seule la guerre rend un territoire évitable — sinon le détour deviendrait le
    // défaut dès la première trêve.
    renderPanel({
      territories: [
        { systemId: "milieu", ownerId: "voisin", ownerColor: "#0f0" },
      ],
      relations: [
        {
          empireA: "moi",
          empireB: "voisin",
          state: "nap",
          since: 0,
          until: null,
        },
      ],
    });
    expect(pickers()).toHaveLength(1);
  });

  it("l'itinéraire retenu part avec la commande", async () => {
    const user = userEvent.setup();
    const send = renderPanel({
      territories: [
        { systemId: "milieu", ownerId: "ennemi", ownerColor: "#f00" },
      ],
      relations: [
        {
          empireA: "moi",
          empireB: "ennemi",
          state: "war",
          since: 0,
          until: null,
        },
      ],
    });
    await user.selectOptions(pickers()[1]!, "safest");
    // Premier champ numérique = première ressource cargo (minerai).
    await user.type(screen.getAllByRole("spinbutton")[0]!, "10");
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]!);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transfer",
        route: ["depart", "contour", "arrivee"],
      }),
    );
  });
});
