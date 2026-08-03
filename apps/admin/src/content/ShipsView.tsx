import type { UpsertShipInput } from "@spacesim/protocol";
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

interface Ship {
  id: string;
  nameFr: string;
  descriptionFr: string;
  capacity: number;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
  speedMult: number;
  fuelPerJump: number;
}

interface Props {
  token: string;
}

function emptyForm(): UpsertShipInput {
  return {
    nameFr: "",
    descriptionFr: "",
    capacity: 200,
    cost: {},
    buildMs: 45_000,
    requiresTech: null,
    speedMult: 1,
    fuelPerJump: 8,
  };
}

function formFromShip(s: Ship): UpsertShipInput {
  return {
    nameFr: s.nameFr,
    descriptionFr: s.descriptionFr,
    capacity: s.capacity,
    cost: s.cost,
    buildMs: s.buildMs,
    requiresTech: s.requiresTech,
    speedMult: s.speedMult,
    fuelPerJump: s.fuelPerJump,
  };
}

/**
 * CMS de contenu (chantier 23.8) — vaisseaux civils historiques, même recette que les
 * vaisseaux de guerre (23.5) : `PUT .../ships/:id` upsert, id choisi par l'admin.
 */
export function ShipsView({ token }: Props) {
  const [ships, setShips] = useState<Ship[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<UpsertShipInput>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/ships", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body: { ships?: Ship[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setShips(body.ships ?? []);
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

  const openEdit = (s: Ship) => {
    setEditing({ id: s.id, isNew: false });
    setForm(formFromShip(s));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError("Id requis");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/admin/content/ships/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(form),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Erreur serveur");
        return;
      }
      setShips(body.ships);
      setEditing(null);
    } catch {
      setSubmitError("Serveur injoignable");
    } finally {
      setSubmitting(false);
    }
  };

  const setCost = (resource: ResourceId, value: number) => {
    setForm((f) => ({ ...f, cost: { ...f.cost, [resource]: value } }));
  };

  const columns: TableColumn<Ship>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    { key: "capacity", label: "Soute", align: "right" },
    { key: "speedMult", label: "Vitesse ×", align: "right" },
    { key: "fuelPerJump", label: "Carburant/saut", align: "right" },
    {
      key: "buildMs",
      label: "Fabrication",
      align: "right",
      render: (v) => `${Math.round((v as number) / 1000)} s`,
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
      title="Vaisseaux civils"
      actions={<Button onClick={openCreate}>Nouveau</Button>}
    >
      {error && <p className="auth-error">{error}</p>}
      {!error && ships === null && <p className="muted">Chargement…</p>}
      {!error && ships && <Table columns={columns} rows={ships} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? "Nouveau vaisseau civil"
                : `Modifier « ${editing.id} »`
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. bulk_freighter)"
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
              <NumberInput
                label="Soute"
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Vitesse (× base)"
                value={form.speedMult}
                onChange={(e) =>
                  setForm({ ...form, speedMult: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Carburant par saut"
                value={form.fuelPerJump}
                onChange={(e) =>
                  setForm({ ...form, fuelPerJump: Number(e.target.value) })
                }
              />
            </div>
            <NumberInput
              label="Temps de fabrication (s)"
              value={form.buildMs / 1000}
              onChange={(e) =>
                setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
              }
            />
            <Field
              label="Tech requise (id, vide = aucune)"
              value={form.requiresTech ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  requiresTech: e.target.value.trim() || null,
                })
              }
            />
            <p className="muted small">Coût de construction</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={res}
                  label={res}
                  value={form.cost[res] ?? 0}
                  onChange={(e) => setCost(res, Number(e.target.value))}
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
