import {
  getGetApiAdminContentChassisQueryKey,
  useGetApiAdminContentChassis,
  usePutApiAdminContentChassisId,
} from "../api/generated/admin.js";
import {
  CHASSIS_KINDS,
  SHIP_DOMAINS,
  type UpsertChassisInput,
} from "@spacesim/protocol";
import { RESOURCES, type ResourceId } from "@spacesim/shared";
import {
  Button,
  Field,
  Modal,
  NumberInput,
  Panel,
  Select,
  Skeleton,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Appearance } from "@spacesim/protocol";
import { useTranslation } from "react-i18next";
import { AppearanceFields } from "./AppearanceFields.js";

interface Chassis {
  id: string;
  nameFr: string;
  descriptionFr: string;
  kind: string;
  domain: string;
  hull: number;
  baseInitiative: number;
  power: number;
  tonnage: number;
  calc: number;
  slots: Record<string, number>;
  baseSpeedMult: number;
  baseFuelPerJump: number;
  roleBonus: Record<string, number> | null;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
  appearance: Appearance;
}

const KIND_KEYS: Record<string, string> = {
  generic: "chassisView.kindGeneric",
  military: "chassisView.kindMilitary",
  freighter: "chassisView.kindFreighter",
  miner: "chassisView.kindMiner",
  colonizer: "chassisView.kindColonizer",
  explorer: "chassisView.kindExplorer",
};

const DOMAIN_KEYS: Record<string, string> = {
  fleet: "chassisView.domainFleet",
  colony: "chassisView.domainColony",
};

interface ChassisForm {
  nameFr: string;
  descriptionFr: string;
  kind: UpsertChassisInput["kind"];
  domain: UpsertChassisInput["domain"];
  hull: number;
  baseInitiative: number;
  power: number;
  tonnage: number;
  calc: number;
  weaponSlots: number;
  defenseSlots: number;
  propulsionSlots: number;
  utilitySlots: number;
  baseSpeedMult: number;
  baseFuelPerJump: number;
  roleBonusText: string;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string;
  appearance: Appearance;
}

function emptyForm(): ChassisForm {
  return {
    nameFr: "",
    descriptionFr: "",
    kind: "generic",
    domain: "fleet",
    hull: 100,
    baseInitiative: 15,
    power: 50,
    tonnage: 60,
    calc: 40,
    weaponSlots: 1,
    defenseSlots: 1,
    propulsionSlots: 1,
    utilitySlots: 1,
    baseSpeedMult: 1,
    baseFuelPerJump: 10,
    roleBonusText: "",
    cost: {},
    buildMs: 60_000,
    requiresTech: "",
    appearance: null,
  };
}

function formFromChassis(c: Chassis): ChassisForm {
  return {
    nameFr: c.nameFr,
    descriptionFr: c.descriptionFr,
    kind: c.kind as UpsertChassisInput["kind"],
    domain: c.domain as UpsertChassisInput["domain"],
    hull: c.hull,
    baseInitiative: c.baseInitiative,
    power: c.power,
    tonnage: c.tonnage,
    calc: c.calc,
    weaponSlots: c.slots.weapon ?? 0,
    defenseSlots: c.slots.defense ?? 0,
    propulsionSlots: c.slots.propulsion ?? 0,
    utilitySlots: c.slots.utility ?? 0,
    baseSpeedMult: c.baseSpeedMult,
    baseFuelPerJump: c.baseFuelPerJump,
    roleBonusText: c.roleBonus ? JSON.stringify(c.roleBonus) : "",
    cost: c.cost,
    buildMs: c.buildMs,
    requiresTech: c.requiresTech ?? "",
    appearance: c.appearance ?? null,
  };
}

/**
 * CMS de contenu (chantier 23.10) — châssis de vaisseau. `roleBonus` (spécialisation,
 * ex. `{"weapon":1.15}`) en JSON brut : peu de champs, mais aucune correspondance
 * directe à une liste fixe de rôles à afficher. Client orval (chantier 27.15).
 */
export function ChassisView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentChassis();
  const chassis = (data?.chassis ?? []) as Chassis[];
  const mutation = usePutApiAdminContentChassisId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<ChassisForm>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (c: Chassis) => {
    setEditing({ id: c.id, isNew: false });
    setForm(formFromChassis(c));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError(t("contentCommon.idRequired"));
      return;
    }
    let roleBonus: Record<string, number> | null = null;
    if (form.roleBonusText.trim()) {
      try {
        roleBonus = JSON.parse(form.roleBonusText);
      } catch {
        setSubmitError(
          t("contentCommon.invalidJson", {
            field: t("contentCommon.roleBonusField"),
          }),
        );
        return;
      }
    }
    const payload: UpsertChassisInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      kind: form.kind,
      domain: form.domain,
      hull: form.hull,
      baseInitiative: form.baseInitiative,
      power: form.power,
      tonnage: form.tonnage,
      calc: form.calc,
      slots: {
        weapon: form.weaponSlots,
        defense: form.defenseSlots,
        propulsion: form.propulsionSlots,
        utility: form.utilitySlots,
      },
      baseSpeedMult: form.baseSpeedMult,
      baseFuelPerJump: form.baseFuelPerJump,
      roleBonus: roleBonus as UpsertChassisInput["roleBonus"],
      cost: form.cost,
      buildMs: form.buildMs,
      requiresTech: form.requiresTech.trim() || null,
      appearance: form.appearance,
    };
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id, data: payload });
      queryClient.setQueryData(getGetApiAdminContentChassisQueryKey(), result);
      setEditing(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  const setCost = (resource: ResourceId, value: number) => {
    setForm((f) => ({ ...f, cost: { ...f.cost, [resource]: value } }));
  };

  const columns: TableColumn<Chassis>[] = [
    { key: "id", label: t("contentCommon.id") },
    { key: "nameFr", label: t("contentCommon.name") },
    {
      key: "kind",
      label: t("chassisView.type"),
      render: (v) => {
        const key = KIND_KEYS[v as string];
        return key ? t(key) : (v as string);
      },
    },
    {
      key: "domain",
      label: t("chassisView.domain"),
      render: (v) => {
        const key = DOMAIN_KEYS[v as string];
        return key ? t(key) : (v as string);
      },
    },
    { key: "hull", label: t("chassisView.title"), align: "right" },
    {
      key: "slots",
      label: t("chassisView.colSlots"),
      render: (v) => {
        const s = v as Record<string, number>;
        return t("chassisView.slotsFormat", {
          weapon: s.weapon ?? 0,
          defense: s.defense ?? 0,
          propulsion: s.propulsion ?? 0,
          utility: s.utility ?? 0,
        });
      },
    },
    {
      key: "requiresTech",
      label: t("contentCommon.requiredTech"),
      render: (v) => (v as string | null) ?? t("contentCommon.none"),
    },
    {
      key: "actions",
      label: "",
      render: (_v, row) => (
        <Button variant="link" onClick={() => openEdit(row)}>
          {t("contentCommon.edit")}
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title={t("chassisView.title")}
      actions={<Button onClick={openCreate}>{t("chassisView.new")}</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("chassisView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={chassis} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            closeLabel={t("contentCommon.close")}
            title={
              editing.isNew
                ? t("chassisView.newTitle")
                : t("contentCommon.editTitle", { id: editing.id })
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label={t("chassisView.idHint")}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            )}
            <Field
              label={t("contentCommon.name")}
              value={form.nameFr}
              onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
            />
            <Field
              label={t("contentCommon.description")}
              value={form.descriptionFr}
              onChange={(e) =>
                setForm({ ...form, descriptionFr: e.target.value })
              }
            />
            <div className="stat-row">
              <Select
                label={t("chassisView.type")}
                value={form.kind}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kind: e.target.value as UpsertChassisInput["kind"],
                  })
                }
                options={CHASSIS_KINDS.map((k) => ({
                  value: k,
                  label: KIND_KEYS[k] ? t(KIND_KEYS[k]) : k,
                }))}
              />
              <Select
                label={t("chassisView.domain")}
                value={form.domain}
                onChange={(e) =>
                  setForm({
                    ...form,
                    domain: e.target.value as UpsertChassisInput["domain"],
                  })
                }
                options={SHIP_DOMAINS.map((d) => ({
                  value: d,
                  label: DOMAIN_KEYS[d] ? t(DOMAIN_KEYS[d]) : d,
                }))}
              />
            </div>
            <div className="stat-row">
              <NumberInput
                label={t("chassisView.title")}
                value={form.hull}
                onChange={(e) =>
                  setForm({ ...form, hull: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("chassisView.baseInitiative")}
                value={form.baseInitiative}
                onChange={(e) =>
                  setForm({ ...form, baseInitiative: Number(e.target.value) })
                }
              />
            </div>
            <p className="muted small">{t("chassisView.budgets")}</p>
            <div className="stat-row">
              <NumberInput
                label={t("chassisView.energy")}
                value={form.power}
                onChange={(e) =>
                  setForm({ ...form, power: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("chassisView.tonnage")}
                value={form.tonnage}
                onChange={(e) =>
                  setForm({ ...form, tonnage: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("chassisView.calc")}
                value={form.calc}
                onChange={(e) =>
                  setForm({ ...form, calc: Number(e.target.value) })
                }
              />
            </div>
            <p className="muted small">{t("chassisView.slotsByType")}</p>
            <div className="stat-row">
              <NumberInput
                label={t("chassisView.weapons")}
                value={form.weaponSlots}
                onChange={(e) =>
                  setForm({ ...form, weaponSlots: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("chassisView.defenses")}
                value={form.defenseSlots}
                onChange={(e) =>
                  setForm({ ...form, defenseSlots: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("chassisView.propulsion")}
                value={form.propulsionSlots}
                onChange={(e) =>
                  setForm({ ...form, propulsionSlots: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("chassisView.utilities")}
                value={form.utilitySlots}
                onChange={(e) =>
                  setForm({ ...form, utilitySlots: Number(e.target.value) })
                }
              />
            </div>
            <div className="stat-row">
              <NumberInput
                label={t("chassisView.baseSpeed")}
                value={form.baseSpeedMult}
                onChange={(e) =>
                  setForm({ ...form, baseSpeedMult: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("chassisView.baseFuel")}
                value={form.baseFuelPerJump}
                onChange={(e) =>
                  setForm({ ...form, baseFuelPerJump: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("contentCommon.buildTime")}
                value={form.buildMs / 1000}
                onChange={(e) =>
                  setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
                }
              />
            </div>
            <Field
              label={t("contentCommon.requiredTechField")}
              value={form.requiresTech}
              onChange={(e) =>
                setForm({ ...form, requiresTech: e.target.value })
              }
            />
            <AppearanceFields
              value={form.appearance}
              onChange={(appearance) => setForm({ ...form, appearance })}
            />
            <div className="field-textarea-wrap">
              <label htmlFor="chassis-role-bonus">
                {t("chassisView.roleBonus")}
              </label>
              <textarea
                id="chassis-role-bonus"
                className="field-textarea"
                value={form.roleBonusText}
                onChange={(e) =>
                  setForm({ ...form, roleBonusText: e.target.value })
                }
                spellCheck={false}
              />
            </div>
            <p className="muted small">{t("contentCommon.buildCost")}</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={res}
                  label={res}
                  value={form.cost[res] ?? 0}
                  onChange={(e) => setCost(res, Number(e.target.value))}
                />
              ))}
            </div>
            {submitError && <p className="auth-error">{submitError}</p>}
          </Modal.Body>
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t("contentCommon.cancel")}
            </Button>
            <Button disabled={mutation.isPending} onClick={() => void submit()}>
              {mutation.isPending
                ? t("contentCommon.saving")
                : t("contentCommon.save")}
            </Button>
          </Modal.Actions>
        </Modal>
      )}
    </Panel>
  );
}
