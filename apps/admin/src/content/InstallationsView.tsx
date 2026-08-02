import type { UpsertInstallationInput } from "@spacesim/protocol";
import { RESOURCES, type ResourceId } from "@spacesim/shared";
import {
  Button,
  Field,
  Modal,
  NumberInput,
  Panel,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useEffect, useState } from "react";

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
}

interface Props {
  token: string;
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
 */
export function InstallationsView({ token }: Props) {
  const [installations, setInstallations] = useState<Installation[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<InstallationForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/installations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body: { installations?: Installation[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setInstallations(body.installations ?? []);
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

  const openEdit = (i: Installation) => {
    setEditing({ id: i.id, isNew: false });
    setForm(formFromInstallation(i));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError("Id requis");
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
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/admin/content/installations/${encodeURIComponent(id)}`,
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
      setInstallations(body.installations);
      setEditing(null);
    } catch {
      setSubmitError("Serveur injoignable");
    } finally {
      setSubmitting(false);
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
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    { key: "zoneType", label: "Type de zone" },
    {
      key: "outputs",
      label: "Produit",
      render: (v) => summarize(v as Record<string, number>),
    },
    {
      key: "inputs",
      label: "Consomme",
      render: (v) => summarize(v as Record<string, number>),
    },
    {
      key: "requiresTech",
      label: "Tech requise",
      render: (v) => (v as string | null) ?? "—",
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
      title="Installations"
      actions={<Button onClick={openCreate}>Nouveau</Button>}
    >
      {error && <p className="auth-error">{error}</p>}
      {!error && installations === null && <p className="muted">Chargement…</p>}
      {!error && installations && (
        <Table columns={columns} rows={installations} />
      )}

      {editing && (
        <Modal onClickOutside={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? "Nouvelle installation"
                : `Modifier « ${editing.id} »`
            }
            onClose={() => setEditing(null)}
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. orbital_relay)"
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
            <Field
              label="Id du type de zone"
              value={form.zoneType}
              onChange={(e) => setForm({ ...form, zoneType: e.target.value })}
            />
            <NumberInput
              label="Temps de construction (s)"
              value={form.buildMs / 1000}
              onChange={(e) =>
                setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
              }
            />
            <Field
              label="Tech requise (id, vide = aucune)"
              value={form.requiresTech}
              onChange={(e) =>
                setForm({ ...form, requiresTech: e.target.value })
              }
            />
            <p className="muted small">Coût de construction</p>
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
            <p className="muted small">Production par tick</p>
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
            <p className="muted small">Consommation par tick</p>
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
