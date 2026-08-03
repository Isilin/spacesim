import {
  WARSHIP_CATEGORIES,
  type UpsertWarshipInput,
} from "@spacesim/protocol";
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

interface Warship {
  id: string;
  nameFr: string;
  descriptionFr: string;
  hull: number;
  shield: number;
  weapons: { long: number; medium: number; short: number };
  initiative: number;
  category: string;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
  fleetDamageBonus: number | null;
}

interface Props {
  token: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  skirmisher: "Escarmoucheur",
  line: "Ligne",
  capital: "Capital",
  support: "Soutien",
};

function emptyForm(): UpsertWarshipInput {
  return {
    nameFr: "",
    descriptionFr: "",
    hull: 100,
    shield: 20,
    weapons: { long: 10, medium: 10, short: 10 },
    initiative: 15,
    category: "skirmisher",
    cost: {},
    buildMs: 60_000,
    requiresTech: null,
    fleetDamageBonus: null,
  };
}

function formFromWarship(w: Warship): UpsertWarshipInput {
  return {
    nameFr: w.nameFr,
    descriptionFr: w.descriptionFr,
    hull: w.hull,
    shield: w.shield,
    weapons: w.weapons,
    initiative: w.initiative,
    category: w.category as UpsertWarshipInput["category"],
    cost: w.cost,
    buildMs: w.buildMs,
    requiresTech: w.requiresTech,
    fleetDamageBonus: w.fleetDamageBonus,
  };
}

/**
 * CMS de contenu (chantier 23.5) — vaisseaux de guerre, domaine pilote. `PUT
 * /api/admin/content/warships/:id` fait office de create-ou-update : le formulaire de
 * création demande juste un id libre (id-minting, pas de mécanique dédiée).
 */
export function WarshipsView({ token }: Props) {
  const [warships, setWarships] = useState<Warship[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<UpsertWarshipInput>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/warships", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body: { warships?: Warship[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setWarships(body.warships ?? []);
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

  const openEdit = (w: Warship) => {
    setEditing({ id: w.id, isNew: false });
    setForm(formFromWarship(w));
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
        `/api/admin/content/warships/${encodeURIComponent(id)}`,
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
      setWarships(body.warships);
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

  const columns: TableColumn<Warship>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    {
      key: "category",
      label: "Catégorie",
      render: (v) => CATEGORY_LABELS[v as string] ?? (v as string),
    },
    { key: "hull", label: "Coque", align: "right" },
    { key: "shield", label: "Boucliers", align: "right" },
    { key: "initiative", label: "Initiative", align: "right" },
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
      title="Vaisseaux de guerre"
      actions={<Button onClick={openCreate}>Nouveau</Button>}
    >
      {error && <p className="auth-error">{error}</p>}
      {!error && warships === null && <p className="muted">Chargement…</p>}
      {!error && warships && <Table columns={columns} rows={warships} />}

      {editing && (
        <Modal onClickOutside={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? "Nouveau vaisseau de guerre"
                : `Modifier « ${editing.id} »`
            }
            onClose={() => setEditing(null)}
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. plasma_cruiser)"
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
            <Select
              label="Catégorie"
              value={form.category}
              onChange={(e) =>
                setForm({
                  ...form,
                  category: e.target.value as UpsertWarshipInput["category"],
                })
              }
              options={WARSHIP_CATEGORIES.map((c) => ({
                value: c,
                label: CATEGORY_LABELS[c] ?? c,
              }))}
            />
            <div className="stat-row">
              <NumberInput
                label="Coque"
                value={form.hull}
                onChange={(e) =>
                  setForm({ ...form, hull: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Boucliers"
                value={form.shield}
                onChange={(e) =>
                  setForm({ ...form, shield: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Initiative"
                value={form.initiative}
                onChange={(e) =>
                  setForm({ ...form, initiative: Number(e.target.value) })
                }
              />
            </div>
            <div className="stat-row">
              <NumberInput
                label="Armes (longue portée)"
                value={form.weapons.long}
                onChange={(e) =>
                  setForm({
                    ...form,
                    weapons: { ...form.weapons, long: Number(e.target.value) },
                  })
                }
              />
              <NumberInput
                label="Armes (portée moyenne)"
                value={form.weapons.medium}
                onChange={(e) =>
                  setForm({
                    ...form,
                    weapons: {
                      ...form.weapons,
                      medium: Number(e.target.value),
                    },
                  })
                }
              />
              <NumberInput
                label="Armes (courte portée)"
                value={form.weapons.short}
                onChange={(e) =>
                  setForm({
                    ...form,
                    weapons: { ...form.weapons, short: Number(e.target.value) },
                  })
                }
              />
            </div>
            <div className="stat-row">
              <NumberInput
                label="Temps de fabrication (s)"
                value={form.buildMs / 1000}
                onChange={(e) =>
                  setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
                }
              />
              <NumberInput
                label="Bonus dégâts de flotte"
                value={form.fleetDamageBonus ?? 0}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fleetDamageBonus: Number(e.target.value) || null,
                  })
                }
              />
            </div>
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
