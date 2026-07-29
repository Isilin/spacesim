import type { UpsertBuildingInput } from "@spacesim/protocol";
import { RESOURCES, type ResourceId } from "@spacesim/shared";
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

interface Props {
  token: string;
}

function summarize(resources: Record<string, number> | null): string {
  if (!resources) return "—";
  const entries = Object.entries(resources).filter(([, v]) => v > 0);
  return entries.length > 0 ? entries.map(([res, v]) => `${res} ${v}`).join(", ") : "—";
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
 */
export function BuildingsView({ token }: Props) {
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertBuildingInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/buildings", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body: { buildings?: Building[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setBuildings(body.buildings ?? []);
      })
      .catch(() => setError("Serveur injoignable"));
  };

  useEffect(load, [token]);

  const openEdit = (b: Building) => {
    setEditingId(b.id);
    setForm(formFromBuilding(b));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editingId || !form) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/content/buildings/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Erreur serveur");
        return;
      }
      setBuildings(body.buildings);
      setEditingId(null);
      setForm(null);
    } catch {
      setSubmitError("Serveur injoignable");
    } finally {
      setSubmitting(false);
    }
  };

  const setResource = (kind: "outputs" | "inputs", resource: ResourceId, value: number) => {
    setForm((f) => (f ? { ...f, [kind]: { ...f[kind], [resource]: value } } : f));
  };

  const columns: TableColumn<Building>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    {
      key: "buildMs",
      label: "Fabrication",
      align: "right",
      render: (v) => `${Math.round((v as number) / 1000)} s`,
    },
    { key: "outputs", label: "Produit", render: (v) => summarize(v as Record<string, number>) },
    { key: "inputs", label: "Consomme", render: (v) => summarize(v as Record<string, number>) },
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
    <Panel title="Bâtiments">
      {error && <p className="auth-error">{error}</p>}
      {!error && buildings === null && <p className="muted">Chargement…</p>}
      {!error && buildings && <Table columns={columns} rows={buildings} />}

      {editingId && form && (
        <Modal
          title={`Modifier « ${editingId} »`}
          onClose={() => setEditingId(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditingId(null)}>
                Annuler
              </Button>
              <Button disabled={submitting} onClick={() => void submit()}>
                {submitting ? "…" : "Enregistrer"}
              </Button>
            </>
          }
        >
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
          <div className="stat-row">
            <NumberInput
              label="Temps de fabrication (s)"
              value={form.buildMs / 1000}
              onChange={(e) => setForm({ ...form, buildMs: Number(e.target.value) * 1000 })}
            />
            <NumberInput
              label="Emplois par instance"
              value={form.jobsPerInstance ?? 0}
              onChange={(e) =>
                setForm({ ...form, jobsPerInstance: Number(e.target.value) || null })
              }
            />
            <Select
              label="Production boostée par le gisement de"
              value={form.depositScaled ?? NO_DEPOSIT}
              onChange={(e) =>
                setForm({
                  ...form,
                  depositScaled: e.target.value === NO_DEPOSIT ? null : e.target.value,
                })
              }
              options={[
                { value: NO_DEPOSIT, label: "Aucune" },
                ...RESOURCES.map((res) => ({ value: res, label: res })),
              ]}
            />
          </div>
          <p className="muted small">Coût de construction</p>
          <div className="stat-row">
            {RESOURCES.map((res) => (
              <NumberInput
                key={`cost-${res}`}
                label={res}
                value={form.cost[res] ?? 0}
                onChange={(e) =>
                  setForm({ ...form, cost: { ...form.cost, [res]: Number(e.target.value) } })
                }
              />
            ))}
          </div>
          <p className="muted small">Production par tick</p>
          <div className="stat-row">
            {RESOURCES.map((res) => (
              <NumberInput
                key={`outputs-${res}`}
                label={res}
                value={form.outputs?.[res] ?? 0}
                onChange={(e) => setResource("outputs", res, Number(e.target.value))}
              />
            ))}
          </div>
          <p className="muted small">Consommation par tick</p>
          <div className="stat-row">
            {RESOURCES.map((res) => (
              <NumberInput
                key={`inputs-${res}`}
                label={res}
                value={form.inputs?.[res] ?? 0}
                onChange={(e) => setResource("inputs", res, Number(e.target.value))}
              />
            ))}
          </div>
          {submitError && <p className="auth-error">{submitError}</p>}
        </Modal>
      )}
    </Panel>
  );
}
