import type { ClientMessage } from "@spacesim/protocol";
import {
  liftThroughput,
  MARKET_RESOURCES,
  orbitalCap,
  orbitalUsed,
  type Colony,
  type EmpireEffects,
  type LiftRule,
  type ResourceId,
} from "@spacesim/shared";
import {
  Badge,
  NumberInput,
  Panel,
  ProgressBar,
  Select,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { RESOURCE_LABELS } from "./labels.js";

interface Props {
  colony: Colony;
  effects: EmpireEffects;
  send: (msg: ClientMessage) => void;
}

/** Ressources transportables — les crédits et la science ne montent pas en orbite. */
const LIFTABLE: ResourceId[] = [...MARKET_RESOURCES];

/**
 * Sol ↔ orbite d'une colonie (chantier 12) : ce qui est en orbite, ce qui monte,
 * et à quel débit. Sans dock, rien n'est exportable — le panneau le dit d'emblée.
 */
export function OrbitPanel({ colony, effects, send }: Props) {
  const cap = orbitalCap(colony, effects);
  const used = orbitalUsed(colony);
  const throughput = liftThroughput(colony, effects);
  const docks = colony.buildings.orbital_dock ?? 0;

  const setRule = (resource: ResourceId, rule: LiftRule | null) =>
    send({ type: "setLiftRule", colonyId: colony.id, resource, rule });

  const columns: TableColumn<ResourceId>[] = [
    { key: "res", label: "Ressource", render: (_, res) => RESOURCE_LABELS[res] },
    {
      key: "ground",
      label: "Sol",
      align: "right",
      render: (_, res) => Math.floor(colony.resources[res]),
    },
    {
      key: "orbit",
      label: "Orbite",
      align: "right",
      trend: (res) => (colony.orbitalResources[res] > 0 ? "up" : undefined),
      render: (_, res) => Math.floor(colony.orbitalResources[res] ?? 0),
    },
    {
      key: "rule",
      label: "Consigne",
      render: (_, res) => {
        const rule = colony.liftRules[res];
        return (
          <Select
            value={rule?.direction ?? "none"}
            disabled={docks === 0}
            options={[
              { value: "none", label: "—" },
              { value: "up", label: "Monter le surplus" },
              { value: "down", label: "Redescendre" },
            ]}
            onChange={(e) =>
              setRule(
                res,
                e.target.value === "none"
                  ? null
                  : {
                      keepGround: rule?.keepGround ?? 0,
                      direction: e.target.value as LiftRule["direction"],
                    },
              )
            }
          />
        );
      },
    },
    {
      key: "threshold",
      label: "Seuil au sol",
      render: (_, res) => {
        const rule = colony.liftRules[res];
        return (
          <NumberInput
            min={0}
            value={rule?.keepGround ?? ""}
            placeholder="0"
            disabled={!rule || docks === 0}
            onChange={(e) =>
              rule &&
              setRule(res, {
                ...rule,
                keepGround: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
          />
        );
      },
    },
  ];

  return (
    <Panel
      title="Orbite"
      actions={
        <Badge variant={docks > 0 ? "neutral" : "ko"}>
          {docks > 0
            ? `${docks} dock${docks > 1 ? "s" : ""} · soute ${Math.floor(used)}/${cap} · ascenseur ${throughput}/tick`
            : "Aucun dock orbital — cette colonie ne peut rien expédier."}
        </Badge>
      }
    >
      {docks > 0 && <ProgressBar value={used} max={cap} />}

      <Table columns={columns} rows={LIFTABLE} />
      <p className="small muted">
        « Monter le surplus » hisse tout ce qui dépasse le seuil gardé au sol ; « redescendre »
        ramène de l'orbite jusqu'à atteindre ce seuil. L'ascenseur est partagé entre les ressources
        et consomme de l'énergie au sol.
      </p>
    </Panel>
  );
}
