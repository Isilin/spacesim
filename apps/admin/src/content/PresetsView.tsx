import type { UpsertPresetInput } from "@spacesim/protocol";
import { Button, Field, Modal, Panel, Select, Table, type TableColumn } from "@spacesim/ui";
import { useEffect, useState } from "react";

interface Preset {
  id: string;
  nameFr: string;
  descriptionFr: string;
  chassisId: string;
  modules: string[];
  starter: boolean;
}

interface Props {
  token: string;
}

interface PresetForm {
  nameFr: string;
  descriptionFr: string;
  chassisId: string;
  modulesText: string;
  starter: "yes" | "no";
}

function emptyForm(): PresetForm {
  return { nameFr: "", descriptionFr: "", chassisId: "", modulesText: "", starter: "no" };
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
 */
export function PresetsView({ token }: Props) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(null);
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<PresetForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/presets", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body: { presets?: Preset[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setPresets(body.presets ?? []);
      })
      .catch(() => setError("Serveur injoignable"));
  };

  useEffect(load, [token]);

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
      setSubmitError("Id requis");
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
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/content/presets/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Erreur serveur");
        return;
      }
      setPresets(body.presets);
      setEditing(null);
    } catch {
      setSubmitError("Serveur injoignable");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: TableColumn<Preset>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    { key: "chassisId", label: "Châssis" },
    { key: "modules", label: "Modules", render: (v) => (v as string[]).join(", ") || "—" },
    { key: "starter", label: "Amorçage", render: (v) => ((v as boolean) ? "Oui" : "—") },
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
    <Panel title="Plans pré-conçus" actions={<Button onClick={openCreate}>Nouveau</Button>}>
      {error && <p className="auth-error">{error}</p>}
      {!error && presets === null && <p className="muted">Chargement…</p>}
      {!error && presets && <Table columns={columns} rows={presets} />}

      {editing && (
        <Modal
          title={editing.isNew ? "Nouveau plan" : `Modifier « ${editing.id} »`}
          onClose={() => setEditing(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button disabled={submitting} onClick={() => void submit()}>
                {submitting ? "…" : "Enregistrer"}
              </Button>
            </>
          }
        >
          {editing.isNew && (
            <Field
              label="Id (identifiant technique, ex. corvette_mk1)"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
            />
          )}
          <Field
            label="Nom"
            value={form.nameFr}
            onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
          />
          <Field
            label="Description"
            value={form.descriptionFr}
            onChange={(e) => setForm({ ...form, descriptionFr: e.target.value })}
          />
          <Field
            label="Id du châssis"
            value={form.chassisId}
            onChange={(e) => setForm({ ...form, chassisId: e.target.value })}
          />
          <Field
            label="Modules (ids séparés par des virgules)"
            value={form.modulesText}
            onChange={(e) => setForm({ ...form, modulesText: e.target.value })}
          />
          <Select
            label="Fourni à la création d'un empire"
            value={form.starter}
            onChange={(e) => setForm({ ...form, starter: e.target.value as "yes" | "no" })}
            options={[
              { value: "no", label: "Non" },
              { value: "yes", label: "Oui" },
            ]}
          />
          {submitError && <p className="auth-error">{submitError}</p>}
        </Modal>
      )}
    </Panel>
  );
}
