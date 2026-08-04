import {
  getGetApiAdminContentInstallationsQueryKey,
  useGetApiAdminContentInstallations,
  usePutApiAdminContentInstallationsId,
} from "../api/generated/admin.js";
import type { UpsertInstallationInput } from "@spacesim/protocol";
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

type InstallationGrant = "resourceMarket" | "blueprintMarket";

const GRANT_KEYS: { value: string; key: string }[] = [
  { value: "", key: "installationsView.grantNone" },
  { value: "resourceMarket", key: "installationsView.grantResourceMarket" },
  { value: "blueprintMarket", key: "installationsView.grantBlueprintMarket" },
];

interface Installation {
  id: string;
  nameFr: string;
  descriptionFr: string;
  zoneType: string;
  cost: Record<string, number>;
  buildMs: number;
  inputs: Record<string, number> | null;
  outputs: Record<string, number> | null;
  requiresTech: string | null;
  grants: InstallationGrant | null;
}

interface InstallationForm {
  nameFr: string;
  descriptionFr: string;
  zoneType: string;
  cost: Record<string, number>;
  buildMs: number;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  requiresTech: string;
  grants: InstallationGrant | "";
}

function emptyForm(): InstallationForm {
  return {
    nameFr: "",
    descriptionFr: "",
    zoneType: "",
    cost: {},
    buildMs: 30_000,
    inputs: {},
    outputs: {},
    requiresTech: "",
    grants: "",
  };
}

function formFromInstallation(i: Installation): InstallationForm {
  return {
    nameFr: i.nameFr,
    descriptionFr: i.descriptionFr,
    zoneType: i.zoneType,
    cost: i.cost,
    buildMs: i.buildMs,
    inputs: i.inputs ?? {},
    outputs: i.outputs ?? {},
    requiresTech: i.requiresTech ?? "",
    grants: i.grants ?? "",
  };
}

function summarize(resources: Record<string, number> | null): string {
  if (!resources) return "—";
  const entries = Object.entries(resources).filter(([, v]) => v > 0);
  return entries.length > 0
    ? entries.map(([res, v]) => `${res} ${v}`).join(", ")
    : "—";
}

/**
 * CMS de contenu (chantier 24.7) — installations de station orbitale. Même recette
 * qu'un module de vaisseau (id libre, id-minting, occupe un emplacement d'un type
 * précis — ici `zoneType` en id libre, comme `chassisId` sur les presets), mais avec
 * `inputs`/`outputs` par tick sur le patron d'un bâtiment de colonie.
 * Client orval (chantier 27.15).
 */
export function InstallationsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentInstallations();
  const installations = (data?.installations ?? []) as Installation[];
  const mutation = usePutApiAdminContentInstallationsId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<InstallationForm>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (i: Installation) => {
    setEditing({ id: i.id, isNew: false });
    setForm(formFromInstallation(i));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError(t("contentCommon.idRequired"));
      return;
    }
    const payload: UpsertInstallationInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      zoneType: form.zoneType.trim(),
      cost: form.cost,
      buildMs: form.buildMs,
      inputs: form.inputs,
      outputs: form.outputs,
      requiresTech: form.requiresTech.trim() || null,
      grants: form.grants || null,
    };
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id, data: payload });
      queryClient.setQueryData(
        getGetApiAdminContentInstallationsQueryKey(),
        result,
      );
      setEditing(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  const setResource = (
    kind: "inputs" | "outputs",
    resource: ResourceId,
    value: number,
  ) => {
    setForm((f) => ({ ...f, [kind]: { ...f[kind], [resource]: value } }));
  };

  const setCost = (resource: ResourceId, value: number) => {
    setForm((f) => ({ ...f, cost: { ...f.cost, [resource]: value } }));
  };

  const columns: TableColumn<Installation>[] = [
    { key: "id", label: t("contentCommon.id") },
    { key: "nameFr", label: t("contentCommon.name") },
    { key: "zoneType", label: t("installationsView.colZoneType") },
    {
      key: "outputs",
      label: t("contentCommon.produces"),
      render: (v) => summarize(v as Record<string, number>),
    },
    {
      key: "inputs",
      label: t("contentCommon.consumes"),
      render: (v) => summarize(v as Record<string, number>),
    },
    {
      key: "requiresTech",
      label: t("contentCommon.requiredTech"),
      render: (v) => (v as string | null) ?? t("contentCommon.none"),
    },
    {
      key: "grants",
      label: t("installationsView.colMarket"),
      render: (v) => {
        const found = GRANT_KEYS.find((o) => o.value === (v ?? ""));
        return found ? t(found.key) : t("contentCommon.none");
      },
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
      title={t("installationsView.title")}
      actions={
        <Button onClick={openCreate}>{t("installationsView.new")}</Button>
      }
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("installationsView.loading")} />
      )}
      {!loadError && !isPending && (
        <Table columns={columns} rows={installations} />
      )}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? t("installationsView.newTitle")
                : t("contentCommon.editTitle", { id: editing.id })
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label={t("installationsView.idHint")}
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
            <Field
              label={t("installationsView.zoneTypeId")}
              value={form.zoneType}
              onChange={(e) => setForm({ ...form, zoneType: e.target.value })}
            />
            <NumberInput
              label={t("installationsView.buildTime")}
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
            <Select
              label={t("installationsView.grantsField")}
              value={form.grants}
              options={GRANT_KEYS.map((o) => ({
                value: o.value,
                label: t(o.key),
              }))}
              onChange={(e) =>
                setForm({
                  ...form,
                  grants: e.target.value as InstallationForm["grants"],
                })
              }
            />
            <p className="muted small">{t("contentCommon.buildCost")}</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={`cost-${res}`}
                  label={res}
                  value={form.cost[res] ?? 0}
                  onChange={(e) => setCost(res, Number(e.target.value))}
                />
              ))}
            </div>
            <p className="muted small">{t("contentCommon.outputsPerTick")}</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={`outputs-${res}`}
                  label={res}
                  value={form.outputs[res] ?? 0}
                  onChange={(e) =>
                    setResource("outputs", res, Number(e.target.value))
                  }
                />
              ))}
            </div>
            <p className="muted small">{t("contentCommon.inputsPerTick")}</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={`inputs-${res}`}
                  label={res}
                  value={form.inputs[res] ?? 0}
                  onChange={(e) =>
                    setResource("inputs", res, Number(e.target.value))
                  }
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
