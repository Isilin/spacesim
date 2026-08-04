import {
  getGetApiAdminContentBuildingsQueryKey,
  useGetApiAdminContentBuildings,
  usePutApiAdminContentBuildingsId,
} from "../api/generated/admin.js";
import type { UpsertBuildingInput } from "@spacesim/protocol";
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

interface Building {
  id: string;
  nameFr: string;
  descriptionFr: string;
  cost: Record<string, number>;
  buildMs: number;
  outputs: Record<string, number> | null;
  inputs: Record<string, number> | null;
  depositScaled: string | null;
  jobsPerInstance: number | null;
}

function summarize(resources: Record<string, number> | null): string {
  if (!resources) return "—";
  const entries = Object.entries(resources).filter(([, v]) => v > 0);
  return entries.length > 0
    ? entries.map(([res, v]) => `${res} ${v}`).join(", ")
    : "—";
}

function formFromBuilding(b: Building): UpsertBuildingInput {
  return {
    nameFr: b.nameFr,
    descriptionFr: b.descriptionFr,
    cost: b.cost,
    buildMs: b.buildMs,
    outputs: b.outputs ?? {},
    inputs: b.inputs ?? {},
    depositScaled: b.depositScaled,
    jobsPerInstance: b.jobsPerInstance,
  };
}

const NO_DEPOSIT = "__none__";

/**
 * CMS de contenu (chantier 23.7) — bâtiments de colonie. À la différence des vaisseaux/
 * factions (23.5/23.6), pas de bouton "Nouveau" : l'id reste un des 12 historiques pour
 * cette passe (`BuildingId` tissé dans `Colony`/protocole, desserrage hors périmètre).
 * Client orval (chantier 27.15).
 */
export function BuildingsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentBuildings();
  const buildings = (data?.buildings ?? []) as Building[];
  const mutation = usePutApiAdminContentBuildingsId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertBuildingInput | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openEdit = (b: Building) => {
    setEditingId(b.id);
    setForm(formFromBuilding(b));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editingId || !form) return;
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id: editingId, data: form });
      queryClient.setQueryData(
        getGetApiAdminContentBuildingsQueryKey(),
        result,
      );
      setEditingId(null);
      setForm(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  const setResource = (
    kind: "outputs" | "inputs",
    resource: ResourceId,
    value: number,
  ) => {
    setForm((f) =>
      f ? { ...f, [kind]: { ...f[kind], [resource]: value } } : f,
    );
  };

  const columns: TableColumn<Building>[] = [
    { key: "id", label: t("contentCommon.id") },
    { key: "nameFr", label: t("contentCommon.name") },
    {
      key: "buildMs",
      label: t("contentCommon.buildDuration"),
      align: "right",
      render: (v) => `${Math.round((v as number) / 1000)} s`,
    },
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
    <Panel title={t("buildingsView.title")}>
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("buildingsView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={buildings} />}

      {editingId && form && (
        <Modal open={editingId !== null} onClose={() => setEditingId(null)}>
          <Modal.Header
            title={t("contentCommon.editTitle", { id: editingId })}
          />
          <Modal.Body>
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
              <NumberInput
                label={t("contentCommon.buildTime")}
                value={form.buildMs / 1000}
                onChange={(e) =>
                  setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
                }
              />
              <NumberInput
                label={t("buildingsView.jobsPerInstance")}
                value={form.jobsPerInstance ?? 0}
                onChange={(e) =>
                  setForm({
                    ...form,
                    jobsPerInstance: Number(e.target.value) || null,
                  })
                }
              />
              <Select
                label={t("buildingsView.depositBoost")}
                value={form.depositScaled ?? NO_DEPOSIT}
                onChange={(e) =>
                  setForm({
                    ...form,
                    depositScaled:
                      e.target.value === NO_DEPOSIT ? null : e.target.value,
                  })
                }
                options={[
                  { value: NO_DEPOSIT, label: t("contentCommon.none") },
                  ...RESOURCES.map((res) => ({ value: res, label: res })),
                ]}
              />
            </div>
            <p className="muted small">{t("contentCommon.buildCost")}</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={`cost-${res}`}
                  label={res}
                  value={form.cost[res] ?? 0}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cost: { ...form.cost, [res]: Number(e.target.value) },
                    })
                  }
                />
              ))}
            </div>
            <p className="muted small">{t("contentCommon.outputsPerTick")}</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={`outputs-${res}`}
                  label={res}
                  value={form.outputs?.[res] ?? 0}
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
                  value={form.inputs?.[res] ?? 0}
                  onChange={(e) =>
                    setResource("inputs", res, Number(e.target.value))
                  }
                />
              ))}
            </div>
            {submitError && <p className="auth-error">{submitError}</p>}
          </Modal.Body>
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setEditingId(null)}>
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
