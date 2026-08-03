import { TECH_BRANCHES, type UpsertTechInput } from "@spacesim/protocol";
import {
  Button,
  Field,
  Modal,
  NumberInput,
  Panel,
  Select,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useEffect, useState } from "react";

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

interface Props {
  token: string;
}

const BRANCH_LABELS: Record<string, string> = {
  industry: "Industrie",
  colonization: "Colonisation",
  society: "Société",
  military: "Militaire",
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
 */
export function TechsView({ token }: Props) {
  const [techs, setTechs] = useState<Tech[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<TechForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/techs", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body: { techs?: Tech[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setTechs(body.techs ?? []);
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

  const openEdit = (t: Tech) => {
    setEditing({ id: t.id, isNew: false });
    setForm(formFromTech(t));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError("Id requis");
      return;
    }
    let effects: unknown;
    try {
      effects = JSON.parse(form.effectsText);
    } catch {
      setSubmitError("Effets : JSON invalide");
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
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/admin/content/techs/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Erreur serveur");
        return;
      }
      setTechs(body.techs);
      setEditing(null);
    } catch {
      setSubmitError("Serveur injoignable");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: TableColumn<Tech>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    {
      key: "branch",
      label: "Branche",
      render: (v) => BRANCH_LABELS[v as string] ?? (v as string),
    },
    { key: "cost", label: "Coût (science)", align: "right" },
    {
      key: "durationMs",
      label: "Durée",
      align: "right",
      render: (v) => `${Math.round((v as number) / 1000)} s`,
    },
    {
      key: "requires",
      label: "Prérequis",
      render: (v) =>
        (v as string[]).length > 0 ? (v as string[]).join(", ") : "—",
    },
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
      title="Arbre de recherche"
      actions={<Button onClick={openCreate}>Nouvelle</Button>}
    >
      {error && <p className="auth-error">{error}</p>}
      {!error && techs === null && <p className="muted">Chargement…</p>}
      {!error && techs && <Table columns={columns} rows={techs} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew ? "Nouvelle tech" : `Modifier « ${editing.id} »`
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. deep_mining)"
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
              onChange={(e) =>
                setForm({ ...form, descriptionFr: e.target.value })
              }
            />
            <div className="stat-row">
              <Select
                label="Branche"
                value={form.branch}
                onChange={(e) =>
                  setForm({
                    ...form,
                    branch: e.target.value as UpsertTechInput["branch"],
                  })
                }
                options={TECH_BRANCHES.map((b) => ({
                  value: b,
                  label: BRANCH_LABELS[b] ?? b,
                }))}
              />
              <NumberInput
                label="Coût (science)"
                value={form.cost}
                onChange={(e) =>
                  setForm({ ...form, cost: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Durée (s)"
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
              label="Prérequis (ids séparés par des virgules)"
              value={form.requiresText}
              onChange={(e) =>
                setForm({ ...form, requiresText: e.target.value })
              }
            />
            <div className="field-textarea-wrap">
              <label htmlFor="tech-effects">
                Effets (JSON — champs de TechEffects)
              </label>
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
              Annuler
            </Button>
            <Button disabled={submitting} onClick={() => void submit()}>
              {submitting ? "…" : "Enregistrer"}
            </Button>
          </Modal.Actions>
        </Modal>
      )}
    </Panel>
  );
}
