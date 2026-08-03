import type { UpsertFactionInput } from "@spacesim/protocol";
import { RESOURCES, type ResourceId } from "@spacesim/shared";
import {
  Badge,
  Button,
  Field,
  Modal,
  NumberInput,
  Panel,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useEffect, useState } from "react";

interface Faction {
  id: string;
  name: string;
  color: string;
  descriptionFr: string;
  produces: Record<string, number>;
  consumes: Record<string, number>;
}

interface Props {
  token: string;
}

function summarize(resources: Record<string, number>): string {
  const entries = Object.entries(resources).filter(([, v]) => v > 0);
  return entries.length > 0
    ? entries.map(([res, v]) => `${res} ${v}`).join(", ")
    : "—";
}

function emptyForm(): UpsertFactionInput {
  return {
    name: "",
    color: "#4fd8ff",
    descriptionFr: "",
    produces: {},
    consumes: {},
  };
}

function formFromFaction(f: Faction): UpsertFactionInput {
  return {
    name: f.name,
    color: f.color,
    descriptionFr: f.descriptionFr,
    produces: f.produces,
    consumes: f.consumes,
  };
}

/** CMS de contenu (chantier 23.6) — factions marchandes PNJ, même recette que les
 *  vaisseaux de guerre (23.5) : `PUT .../factions/:id` upsert, id choisi par l'admin. */
export function FactionsView({ token }: Props) {
  const [factions, setFactions] = useState<Faction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<UpsertFactionInput>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/factions", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body: { factions?: Faction[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setFactions(body.factions ?? []);
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

  const openEdit = (f: Faction) => {
    setEditing({ id: f.id, isNew: false });
    setForm(formFromFaction(f));
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
        `/api/admin/content/factions/${encodeURIComponent(id)}`,
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
      setFactions(body.factions);
      setEditing(null);
    } catch {
      setSubmitError("Serveur injoignable");
    } finally {
      setSubmitting(false);
    }
  };

  const setResource = (
    kind: "produces" | "consumes",
    resource: ResourceId,
    value: number,
  ) => {
    setForm((f) => ({ ...f, [kind]: { ...f[kind], [resource]: value } }));
  };

  const columns: TableColumn<Faction>[] = [
    { key: "id", label: "Id" },
    {
      key: "name",
      label: "Nom",
      render: (v, row) => (
        <>
          <Badge style={{ background: row.color, marginRight: 6 }}>
            &nbsp;
          </Badge>
          {v as string}
        </>
      ),
    },
    {
      key: "produces",
      label: "Produit",
      render: (v) => summarize(v as Record<string, number>),
    },
    {
      key: "consumes",
      label: "Consomme",
      render: (v) => summarize(v as Record<string, number>),
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
      title="Factions marchandes"
      actions={<Button onClick={openCreate}>Nouvelle</Button>}
    >
      {error && <p className="auth-error">{error}</p>}
      {!error && factions === null && <p className="muted">Chargement…</p>}
      {!error && factions && <Table columns={columns} rows={factions} />}

      {editing && (
        <Modal onClickOutside={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew ? "Nouvelle faction" : `Modifier « ${editing.id} »`
            }
            onClose={() => setEditing(null)}
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. helion_syndicate)"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            )}
            <Field
              label="Nom"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Field
              label="Couleur (hex, ex. #ff8c42)"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <Field
              label="Description"
              value={form.descriptionFr}
              onChange={(e) =>
                setForm({ ...form, descriptionFr: e.target.value })
              }
            />
            <p className="muted small">Production par tick économique</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={`produces-${res}`}
                  label={res}
                  value={form.produces[res] ?? 0}
                  onChange={(e) =>
                    setResource("produces", res, Number(e.target.value))
                  }
                />
              ))}
            </div>
            <p className="muted small">Consommation par tick économique</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={`consumes-${res}`}
                  label={res}
                  value={form.consumes[res] ?? 0}
                  onChange={(e) =>
                    setResource("consumes", res, Number(e.target.value))
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
