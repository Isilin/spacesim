import {
  getGetApiAdminContentMilestonesQueryKey,
  useGetApiAdminContentMilestones,
  usePutApiAdminContentMilestonesId,
} from "../api/generated/admin.js";
import {
  MILESTONE_METRICS,
  type UpsertMilestoneInput,
} from "@spacesim/protocol";
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

interface Milestone {
  id: string;
  metric: string;
  threshold: number;
}

const METRIC_KEYS: Record<string, string> = {
  population: "milestonesView.metricPopulation",
  colonies: "milestonesView.metricColonies",
  explored: "milestonesView.metricExplored",
  techs: "milestonesView.metricTechs",
};

interface MilestoneForm {
  metric: UpsertMilestoneInput["metric"];
  threshold: number;
}

function emptyForm(): MilestoneForm {
  return { metric: "population", threshold: 25 };
}

function formFromMilestone(m: Milestone): MilestoneForm {
  return {
    metric: m.metric as UpsertMilestoneInput["metric"],
    threshold: m.threshold,
  };
}

/**
 * CMS de contenu (chantier 23.11) — jalons sandbox affichés sur l'écran Empire.
 * `metric` reste un enum fermé (4 valeurs calculées côté client, `apps/web/EmpireView.tsx`).
 * Client orval (chantier 27.15).
 */
export function MilestonesView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentMilestones();
  const milestones = (data?.milestones ?? []) as Milestone[];
  const mutation = usePutApiAdminContentMilestonesId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<MilestoneForm>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (m: Milestone) => {
    setEditing({ id: m.id, isNew: false });
    setForm(formFromMilestone(m));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError(t("contentCommon.idRequired"));
      return;
    }
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id, data: form });
      queryClient.setQueryData(
        getGetApiAdminContentMilestonesQueryKey(),
        result,
      );
      setEditing(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  const columns: TableColumn<Milestone>[] = [
    { key: "id", label: t("contentCommon.id") },
    {
      key: "metric",
      label: t("milestonesView.colMetric"),
      render: (v) => {
        const key = METRIC_KEYS[v as string];
        return key ? t(key) : (v as string);
      },
    },
    { key: "threshold", label: t("milestonesView.threshold"), align: "right" },
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
      title={t("milestonesView.title")}
      actions={<Button onClick={openCreate}>{t("milestonesView.new")}</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("milestonesView.loading")} />
      )}
      {!loadError && !isPending && (
        <Table columns={columns} rows={milestones} />
      )}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? t("milestonesView.newTitle")
                : t("contentCommon.editTitle", { id: editing.id })
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label={t("milestonesView.idHint")}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            )}
            <Select
              label={t("milestonesView.metric")}
              value={form.metric}
              onChange={(e) =>
                setForm({
                  ...form,
                  metric: e.target.value as UpsertMilestoneInput["metric"],
                })
              }
              options={MILESTONE_METRICS.map((m) => ({
                value: m,
                label: METRIC_KEYS[m] ? t(METRIC_KEYS[m]) : m,
              }))}
            />
            <NumberInput
              label={t("milestonesView.threshold")}
              value={form.threshold}
              onChange={(e) =>
                setForm({ ...form, threshold: Number(e.target.value) })
              }
            />
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
