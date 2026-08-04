import {
  getGetApiAdminContentModulesQueryKey,
  useGetApiAdminContentModules,
  usePutApiAdminContentModulesId,
} from "../api/generated/admin.js";
import {
  MODULE_ROLES,
  SLOT_TYPES,
  type UpsertModuleInput,
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
import { useTranslation } from "react-i18next";

interface Module {
  id: string;
  nameFr: string;
  descriptionFr: string;
  slot: string;
  role: string;
  power: number;
  tonnage: number;
  calc: number;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
  effects: Record<string, unknown>;
}

const SLOT_KEYS: Record<string, string> = {
  weapon: "modulesView.slotWeapon",
  defense: "modulesView.slotDefense",
  propulsion: "modulesView.slotPropulsion",
  utility: "modulesView.slotUtility",
};

const ROLE_KEYS: Record<string, string> = {
  weapon: "modulesView.roleWeapon",
  defense: "modulesView.roleDefense",
  propulsion: "modulesView.rolePropulsion",
  cargo: "modulesView.roleCargo",
  mining: "modulesView.roleMining",
  habitat: "modulesView.roleHabitat",
  support: "modulesView.roleSupport",
  sensor: "modulesView.roleSensor",
};

interface ModuleForm {
  nameFr: string;
  descriptionFr: string;
  slot: UpsertModuleInput["slot"];
  role: UpsertModuleInput["role"];
  power: number;
  tonnage: number;
  calc: number;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string;
  effectsText: string;
}

function emptyForm(): ModuleForm {
  return {
    nameFr: "",
    descriptionFr: "",
    slot: "weapon",
    role: "weapon",
    power: 10,
    tonnage: 5,
    calc: 4,
    cost: {},
    buildMs: 8_000,
    requiresTech: "",
    effectsText: "{}",
  };
}

function formFromModule(m: Module): ModuleForm {
  return {
    nameFr: m.nameFr,
    descriptionFr: m.descriptionFr,
    slot: m.slot as UpsertModuleInput["slot"],
    role: m.role as UpsertModuleInput["role"],
    power: m.power,
    tonnage: m.tonnage,
    calc: m.calc,
    cost: m.cost,
    buildMs: m.buildMs,
    requiresTech: m.requiresTech ?? "",
    effectsText: JSON.stringify(m.effects, null, 2),
  };
}

/**
 * CMS de contenu (chantier 23.10) — modules de vaisseau. `effects` en JSON brut (10
 * champs optionnels de `ModuleEffects`), même choix que les effets de tech (23.9).
 * Client orval (chantier 27.15).
 */
export function ModulesView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentModules();
  const modules = (data?.modules ?? []) as Module[];
  const mutation = usePutApiAdminContentModulesId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<ModuleForm>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (m: Module) => {
    setEditing({ id: m.id, isNew: false });
    setForm(formFromModule(m));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError(t("contentCommon.idRequired"));
      return;
    }
    let effects: unknown;
    try {
      effects = JSON.parse(form.effectsText);
    } catch {
      setSubmitError(
        t("contentCommon.invalidJson", {
          field: t("contentCommon.effectsField"),
        }),
      );
      return;
    }
    const payload: UpsertModuleInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      slot: form.slot,
      role: form.role,
      power: form.power,
      tonnage: form.tonnage,
      calc: form.calc,
      cost: form.cost,
      buildMs: form.buildMs,
      requiresTech: form.requiresTech.trim() || null,
      effects: effects as UpsertModuleInput["effects"],
    };
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id, data: payload });
      queryClient.setQueryData(getGetApiAdminContentModulesQueryKey(), result);
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

  const columns: TableColumn<Module>[] = [
    { key: "id", label: t("contentCommon.id") },
    { key: "nameFr", label: t("contentCommon.name") },
    {
      key: "slot",
      label: t("modulesView.slot"),
      render: (v) => {
        const key = SLOT_KEYS[v as string];
        return key ? t(key) : (v as string);
      },
    },
    {
      key: "role",
      label: t("modulesView.role"),
      render: (v) => {
        const key = ROLE_KEYS[v as string];
        return key ? t(key) : (v as string);
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
      title={t("modulesView.title")}
      actions={<Button onClick={openCreate}>{t("modulesView.new")}</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("modulesView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={modules} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? t("modulesView.newTitle")
                : t("contentCommon.editTitle", { id: editing.id })
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label={t("modulesView.idHint")}
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
                label={t("modulesView.slot")}
                value={form.slot}
                onChange={(e) =>
                  setForm({
                    ...form,
                    slot: e.target.value as UpsertModuleInput["slot"],
                  })
                }
                options={SLOT_TYPES.map((s) => ({
                  value: s,
                  label: SLOT_KEYS[s] ? t(SLOT_KEYS[s]) : s,
                }))}
              />
              <Select
                label={t("modulesView.role")}
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as UpsertModuleInput["role"],
                  })
                }
                options={MODULE_ROLES.map((r) => ({
                  value: r,
                  label: ROLE_KEYS[r] ? t(ROLE_KEYS[r]) : r,
                }))}
              />
            </div>
            <p className="muted small">{t("modulesView.budgetsConsumed")}</p>
            <div className="stat-row">
              <NumberInput
                label={t("modulesView.energy")}
                value={form.power}
                onChange={(e) =>
                  setForm({ ...form, power: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("modulesView.tonnage")}
                value={form.tonnage}
                onChange={(e) =>
                  setForm({ ...form, tonnage: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("modulesView.calc")}
                value={form.calc}
                onChange={(e) =>
                  setForm({ ...form, calc: Number(e.target.value) })
                }
              />
            </div>
            <NumberInput
              label={t("contentCommon.buildTime")}
              value={form.buildMs / 1000}
              onChange={(e) =>
                setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
              }
            />
            <Field
              label={t("contentCommon.requiredTechField")}
              value={form.requiresTech}
              onChange={(e) =>
                setForm({ ...form, requiresTech: e.target.value })
              }
            />
            <div className="field-textarea-wrap">
              <label htmlFor="module-effects">{t("modulesView.effects")}</label>
              <textarea
                id="module-effects"
                className="field-textarea"
                value={form.effectsText}
                onChange={(e) =>
                  setForm({ ...form, effectsText: e.target.value })
                }
                spellCheck={false}
              />
            </div>
            <p className="muted small">
              {t("modulesView.buildCostAddedToChassis")}
            </p>
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
