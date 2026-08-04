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

interface Milestone {
  id: string;
  metric: string;
  threshold: number;
}

const METRIC_LABELS: Record<string, string> = {
  population: "Population totale",
  colonies: "Colonies fondées",
  explored: "Systèmes explorés",
  techs: "Technologies acquises",
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
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentMilestones();
  const milestones = (data?.milestones ?? []) as Milestone[];
  const mutation = usePutApiAdminContentMilestonesId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : "Serveur injoignable"
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
      setSubmitError("Id requis");
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
      setSubmitError(err instanceof Error ? err.message : "Erreur serveur");
    }
  };

  const columns: TableColumn<Milestone>[] = [
    { key: "id", label: "Id" },
    {
      key: "metric",
      label: "Mesure",
      render: (v) => METRIC_LABELS[v as string] ?? (v as string),
    },
    { key: "threshold", label: "Seuil", align: "right" },
    {
      key: "actions",
      label: "",
      render: (_v, row) => (
        <Button variant="link" onClick={() => openEdit(row)}>
          Modifier
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="Jalons"
      actions={<Button onClick={openCreate}>Nouveau</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label="Chargement des jalons…" />
      )}
      {!loadError && !isPending && (
        <Table columns={columns} rows={milestones} />
      )}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew ? "Nouveau jalon" : `Modifier « ${editing.id} »`
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. pop-5000)"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            )}
            <Select
              label="Mesure"
              value={form.metric}
              onChange={(e) =>
                setForm({
                  ...form,
                  metric: e.target.value as UpsertMilestoneInput["metric"],
                })
              }
              options={MILESTONE_METRICS.map((m) => ({
                value: m,
                label: METRIC_LABELS[m] ?? m,
              }))}
            />
            <NumberInput
              label="Seuil"
              value={form.threshold}
              onChange={(e) =>
                setForm({ ...form, threshold: Number(e.target.value) })
              }
            />
            {submitError && <p className="auth-error">{submitError}</p>}
          </Modal.Body>
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Annuler
            </Button>
            <Button disabled={mutation.isPending} onClick={() => void submit()}>
              {mutation.isPending ? "…" : "Enregistrer"}
            </Button>
          </Modal.Actions>
        </Modal>
      )}
    </Panel>
  );
}
