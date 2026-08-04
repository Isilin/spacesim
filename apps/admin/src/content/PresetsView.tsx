import {
  getGetApiAdminContentPresetsQueryKey,
  useGetApiAdminContentPresets,
  usePutApiAdminContentPresetsId,
} from "../api/generated/admin.js";
import type { UpsertPresetInput } from "@spacesim/protocol";
import {
  Button,
  Field,
  Modal,
  Panel,
  Select,
  Skeleton,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Preset {
  id: string;
  nameFr: string;
  descriptionFr: string;
  chassisId: string;
  modules: string[];
  starter: boolean;
}

interface PresetForm {
  nameFr: string;
  descriptionFr: string;
  chassisId: string;
  modulesText: string;
  starter: "yes" | "no";
}

function emptyForm(): PresetForm {
  return {
    nameFr: "",
    descriptionFr: "",
    chassisId: "",
    modulesText: "",
    starter: "no",
  };
}

function formFromPreset(p: Preset): PresetForm {
  return {
    nameFr: p.nameFr,
    descriptionFr: p.descriptionFr,
    chassisId: p.chassisId,
    modulesText: p.modules.join(", "),
    starter: p.starter ? "yes" : "no",
  };
}

/**
 * CMS de contenu (chantier 23.11) — plans pré-conçus. `chassisId`/`modules` en texte
 * libre (ids séparés par virgule pour les modules) : la validation réelle vient de
 * `resolveBlueprint`/`validateBlueprint` côté serveur (23.10), pas de cette route.
 * Client orval (chantier 27.15).
 */
export function PresetsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentPresets();
  const presets = (data?.presets ?? []) as Preset[];
  const mutation = usePutApiAdminContentPresetsId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<PresetForm>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (p: Preset) => {
    setEditing({ id: p.id, isNew: false });
    setForm(formFromPreset(p));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError(t("contentCommon.idRequired"));
      return;
    }
    const payload: UpsertPresetInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      chassisId: form.chassisId.trim(),
      modules: form.modulesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      starter: form.starter === "yes",
    };
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id, data: payload });
      queryClient.setQueryData(getGetApiAdminContentPresetsQueryKey(), result);
      setEditing(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  const columns: TableColumn<Preset>[] = [
    { key: "id", label: t("contentCommon.id") },
    { key: "nameFr", label: t("contentCommon.name") },
    { key: "chassisId", label: t("presetsView.colChassis") },
    {
      key: "modules",
      label: t("presetsView.colModules"),
      render: (v) => (v as string[]).join(", ") || t("contentCommon.none"),
    },
    {
      key: "starter",
      label: t("presetsView.colStarter"),
      render: (v) =>
        (v as boolean) ? t("contentCommon.yes") : t("contentCommon.none"),
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
      title={t("presetsView.title")}
      actions={<Button onClick={openCreate}>{t("presetsView.new")}</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("presetsView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={presets} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            closeLabel={t("contentCommon.close")}
            title={
              editing.isNew
                ? t("presetsView.newTitle")
                : t("contentCommon.editTitle", { id: editing.id })
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label={t("presetsView.idHint")}
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
              label={t("presetsView.chassisId")}
              value={form.chassisId}
              onChange={(e) => setForm({ ...form, chassisId: e.target.value })}
            />
            <Field
              label={t("presetsView.modules")}
              value={form.modulesText}
              onChange={(e) =>
                setForm({ ...form, modulesText: e.target.value })
              }
            />
            <Select
              label={t("presetsView.starterField")}
              value={form.starter}
              onChange={(e) =>
                setForm({ ...form, starter: e.target.value as "yes" | "no" })
              }
              options={[
                { value: "no", label: t("contentCommon.no") },
                { value: "yes", label: t("contentCommon.yes") },
              ]}
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
