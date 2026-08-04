import {
  getGetApiAdminContentTechsQueryKey,
  useGetApiAdminContentTechs,
  usePutApiAdminContentTechsId,
} from "../api/generated/admin.js";
import { TECH_BRANCHES, type UpsertTechInput } from "@spacesim/protocol";
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

interface Tech {
  id: string;
  nameFr: string;
  descriptionFr: string;
  branch: string;
  cost: number;
  durationMs: number;
  requires: string[];
  effects: Record<string, unknown>;
}

const BRANCH_KEYS: Record<string, string> = {
  industry: "techsView.branchIndustry",
  colonization: "techsView.branchColonization",
  society: "techsView.branchSociety",
  military: "techsView.branchMilitary",
};

interface TechForm {
  nameFr: string;
  descriptionFr: string;
  branch: UpsertTechInput["branch"];
  cost: number;
  durationMs: number;
  requiresText: string;
  effectsText: string;
}

function emptyForm(): TechForm {
  return {
    nameFr: "",
    descriptionFr: "",
    branch: "industry",
    cost: 100,
    durationMs: 120_000,
    requiresText: "",
    effectsText: "{}",
  };
}

function formFromTech(t: Tech): TechForm {
  return {
    nameFr: t.nameFr,
    descriptionFr: t.descriptionFr,
    branch: t.branch as UpsertTechInput["branch"],
    cost: t.cost,
    durationMs: t.durationMs,
    requiresText: t.requires.join(", "),
    effectsText: JSON.stringify(t.effects, null, 2),
  };
}

/**
 * CMS de contenu (chantier 23.9) — arbre de recherche, domaine graphe. `requires` se
 * saisit en liste d'ids séparés par des virgules (pas de widget de sélection multiple
 * dans `@spacesim/ui`) ; `effects` en JSON brut (25 champs optionnels de `TechEffects`,
 * un formulaire à 25 champs serait disproportionné). Le serveur rejoue `validateTree`
 * (prérequis inconnus, cycles) à chaque écriture — les erreurs remontent telles quelles.
 * Client orval (chantier 27.15).
 */
export function TechsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentTechs();
  const techs = (data?.techs ?? []) as Tech[];
  const mutation = usePutApiAdminContentTechsId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<TechForm>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (t: Tech) => {
    setEditing({ id: t.id, isNew: false });
    setForm(formFromTech(t));
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
    const payload: UpsertTechInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      branch: form.branch,
      cost: form.cost,
      durationMs: form.durationMs,
      requires: form.requiresText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      effects: effects as UpsertTechInput["effects"],
    };
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id, data: payload });
      queryClient.setQueryData(getGetApiAdminContentTechsQueryKey(), result);
      setEditing(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  const columns: TableColumn<Tech>[] = [
    { key: "id", label: t("contentCommon.id") },
    { key: "nameFr", label: t("contentCommon.name") },
    {
      key: "branch",
      label: t("techsView.branch"),
      render: (v) => {
        const key = BRANCH_KEYS[v as string];
        return key ? t(key) : (v as string);
      },
    },
    { key: "cost", label: t("techsView.scienceCost"), align: "right" },
    {
      key: "durationMs",
      label: t("techsView.colDuration"),
      align: "right",
      render: (v) => `${Math.round((v as number) / 1000)} s`,
    },
    {
      key: "requires",
      label: t("techsView.colRequires"),
      render: (v) =>
        (v as string[]).length > 0
          ? (v as string[]).join(", ")
          : t("contentCommon.none"),
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
      title={t("techsView.title")}
      actions={<Button onClick={openCreate}>{t("techsView.new")}</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("techsView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={techs} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? t("techsView.newTitle")
                : t("contentCommon.editTitle", { id: editing.id })
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label={t("techsView.idHint")}
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
                label={t("techsView.branch")}
                value={form.branch}
                onChange={(e) =>
                  setForm({
                    ...form,
                    branch: e.target.value as UpsertTechInput["branch"],
                  })
                }
                options={TECH_BRANCHES.map((b) => ({
                  value: b,
                  label: BRANCH_KEYS[b] ? t(BRANCH_KEYS[b]) : b,
                }))}
              />
              <NumberInput
                label={t("techsView.scienceCost")}
                value={form.cost}
                onChange={(e) =>
                  setForm({ ...form, cost: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("techsView.duration")}
                value={form.durationMs / 1000}
                onChange={(e) =>
                  setForm({
                    ...form,
                    durationMs: Number(e.target.value) * 1000,
                  })
                }
              />
            </div>
            <Field
              label={t("techsView.requires")}
              value={form.requiresText}
              onChange={(e) =>
                setForm({ ...form, requiresText: e.target.value })
              }
            />
            <div className="field-textarea-wrap">
              <label htmlFor="tech-effects">{t("techsView.effects")}</label>
              <textarea
                id="tech-effects"
                className="field-textarea"
                value={form.effectsText}
                onChange={(e) =>
                  setForm({ ...form, effectsText: e.target.value })
                }
                spellCheck={false}
              />
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
