import type { UpsertZoneTypeInput } from "@spacesim/protocol";
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

interface ZoneType {
  id: string;
  nameFr: string;
  descriptionFr: string;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
}

interface Props {
  token: string;
}

interface ZoneTypeForm {
  nameFr: string;
  descriptionFr: string;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string;
}

function emptyForm(): ZoneTypeForm {
  return {
    nameFr: "",
    descriptionFr: "",
    cost: {},
    buildMs: 60_000,
    requiresTech: "",
  };
}

function formFromZoneType(z: ZoneType): ZoneTypeForm {
  return {
    nameFr: z.nameFr,
    descriptionFr: z.descriptionFr,
    cost: z.cost,
    buildMs: z.buildMs,
    requiresTech: z.requiresTech ?? "",
  };
}

/**
 * CMS de contenu (chantier 24.7) — types de zone de station orbitale. Même recette
 * qu'un châssis/module (id libre, id-minting) mais sans emplacements ni effets : une
 * zone construite ajoute une instance positionnée sur la grille hexagonale de la
 * station (voir `Station.zones`, `sim/industry/station-layout`, chantier 26).
 */
export function ZoneTypesView({ token }: Props) {
  const [zoneTypes, setZoneTypes] = useState<ZoneType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<ZoneTypeForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/zone-types", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body: { zoneTypes?: ZoneType[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setZoneTypes(body.zoneTypes ?? []);
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

  const openEdit = (z: ZoneType) => {
    setEditing({ id: z.id, isNew: false });
    setForm(formFromZoneType(z));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError("Id requis");
      return;
    }
    const payload: UpsertZoneTypeInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      cost: form.cost,
      buildMs: form.buildMs,
      requiresTech: form.requiresTech.trim() || null,
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/admin/content/zone-types/${encodeURIComponent(id)}`,
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
      setZoneTypes(body.zoneTypes);
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

  const columns: TableColumn<ZoneType>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    {
      key: "buildMs",
      label: "Construction",
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
      title="Types de zone"
      actions={<Button onClick={openCreate}>Nouveau</Button>}
    >
      {error && <p className="auth-error">{error}</p>}
      {!error && zoneTypes === null && <p className="muted">Chargement…</p>}
      {!error && zoneTypes && <Table columns={columns} rows={zoneTypes} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? "Nouveau type de zone"
                : `Modifier « ${editing.id} »`
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. logistics_zone)"
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
