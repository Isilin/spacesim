import {
  CHASSIS_KINDS,
  SHIP_DOMAINS,
  type UpsertChassisInput,
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

interface Chassis {
  id: string;
  nameFr: string;
  descriptionFr: string;
  kind: string;
  domain: string;
  hull: number;
  baseInitiative: number;
  power: number;
  tonnage: number;
  calc: number;
  slots: Record<string, number>;
  baseSpeedMult: number;
  baseFuelPerJump: number;
  roleBonus: Record<string, number> | null;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
}

interface Props {
  token: string;
}

const KIND_LABELS: Record<string, string> = {
  generic: "Générique",
  military: "Militaire",
  freighter: "Cargo",
  miner: "Minier",
  colonizer: "Colonisateur",
  explorer: "Éclaireur",
};

const DOMAIN_LABELS: Record<string, string> = {
  fleet: "Flotte",
  colony: "Colonie",
};

interface ChassisForm {
  nameFr: string;
  descriptionFr: string;
  kind: UpsertChassisInput["kind"];
  domain: UpsertChassisInput["domain"];
  hull: number;
  baseInitiative: number;
  power: number;
  tonnage: number;
  calc: number;
  weaponSlots: number;
  defenseSlots: number;
  propulsionSlots: number;
  utilitySlots: number;
  baseSpeedMult: number;
  baseFuelPerJump: number;
  roleBonusText: string;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string;
}

function emptyForm(): ChassisForm {
  return {
    nameFr: "",
    descriptionFr: "",
    kind: "generic",
    domain: "fleet",
    hull: 100,
    baseInitiative: 15,
    power: 50,
    tonnage: 60,
    calc: 40,
    weaponSlots: 1,
    defenseSlots: 1,
    propulsionSlots: 1,
    utilitySlots: 1,
    baseSpeedMult: 1,
    baseFuelPerJump: 10,
    roleBonusText: "",
    cost: {},
    buildMs: 60_000,
    requiresTech: "",
  };
}

function formFromChassis(c: Chassis): ChassisForm {
  return {
    nameFr: c.nameFr,
    descriptionFr: c.descriptionFr,
    kind: c.kind as UpsertChassisInput["kind"],
    domain: c.domain as UpsertChassisInput["domain"],
    hull: c.hull,
    baseInitiative: c.baseInitiative,
    power: c.power,
    tonnage: c.tonnage,
    calc: c.calc,
    weaponSlots: c.slots.weapon ?? 0,
    defenseSlots: c.slots.defense ?? 0,
    propulsionSlots: c.slots.propulsion ?? 0,
    utilitySlots: c.slots.utility ?? 0,
    baseSpeedMult: c.baseSpeedMult,
    baseFuelPerJump: c.baseFuelPerJump,
    roleBonusText: c.roleBonus ? JSON.stringify(c.roleBonus) : "",
    cost: c.cost,
    buildMs: c.buildMs,
    requiresTech: c.requiresTech ?? "",
  };
}

/**
 * CMS de contenu (chantier 23.10) — châssis de vaisseau. `roleBonus` (spécialisation,
 * ex. `{"weapon":1.15}`) en JSON brut : peu de champs, mais aucune correspondance
 * directe à une liste fixe de rôles à afficher.
 */
export function ChassisView({ token }: Props) {
  const [chassis, setChassis] = useState<Chassis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<ChassisForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/chassis", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body: { chassis?: Chassis[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setChassis(body.chassis ?? []);
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

  const openEdit = (c: Chassis) => {
    setEditing({ id: c.id, isNew: false });
    setForm(formFromChassis(c));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError("Id requis");
      return;
    }
    let roleBonus: Record<string, number> | null = null;
    if (form.roleBonusText.trim()) {
      try {
        roleBonus = JSON.parse(form.roleBonusText);
      } catch {
        setSubmitError("Bonus de rôle : JSON invalide");
        return;
      }
    }
    const payload: UpsertChassisInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      kind: form.kind,
      domain: form.domain,
      hull: form.hull,
      baseInitiative: form.baseInitiative,
      power: form.power,
      tonnage: form.tonnage,
      calc: form.calc,
      slots: {
        weapon: form.weaponSlots,
        defense: form.defenseSlots,
        propulsion: form.propulsionSlots,
        utility: form.utilitySlots,
      },
      baseSpeedMult: form.baseSpeedMult,
      baseFuelPerJump: form.baseFuelPerJump,
      roleBonus: roleBonus as UpsertChassisInput["roleBonus"],
      cost: form.cost,
      buildMs: form.buildMs,
      requiresTech: form.requiresTech.trim() || null,
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/admin/content/chassis/${encodeURIComponent(id)}`,
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
      setChassis(body.chassis);
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

  const columns: TableColumn<Chassis>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    {
      key: "kind",
      label: "Type",
      render: (v) => KIND_LABELS[v as string] ?? (v as string),
    },
    {
      key: "domain",
      label: "Domaine",
      render: (v) => DOMAIN_LABELS[v as string] ?? (v as string),
    },
    { key: "hull", label: "Coque", align: "right" },
    {
      key: "slots",
      label: "Emplacements",
      render: (v) => {
        const s = v as Record<string, number>;
        return `A${s.weapon ?? 0} D${s.defense ?? 0} P${s.propulsion ?? 0} U${s.utility ?? 0}`;
      },
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
      title="Châssis"
      actions={<Button onClick={openCreate}>Nouveau</Button>}
    >
      {error && <p className="auth-error">{error}</p>}
      {!error && chassis === null && <p className="muted">Chargement…</p>}
      {!error && chassis && <Table columns={columns} rows={chassis} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew ? "Nouveau châssis" : `Modifier « ${editing.id} »`
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. assault_frame)"
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
                label="Type"
                value={form.kind}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kind: e.target.value as UpsertChassisInput["kind"],
                  })
                }
                options={CHASSIS_KINDS.map((k) => ({
                  value: k,
                  label: KIND_LABELS[k] ?? k,
                }))}
              />
              <Select
                label="Domaine"
                value={form.domain}
                onChange={(e) =>
                  setForm({
                    ...form,
                    domain: e.target.value as UpsertChassisInput["domain"],
                  })
                }
                options={SHIP_DOMAINS.map((d) => ({
                  value: d,
                  label: DOMAIN_LABELS[d] ?? d,
                }))}
              />
            </div>
            <div className="stat-row">
              <NumberInput
                label="Coque"
                value={form.hull}
                onChange={(e) =>
                  setForm({ ...form, hull: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Initiative de base"
                value={form.baseInitiative}
                onChange={(e) =>
                  setForm({ ...form, baseInitiative: Number(e.target.value) })
                }
              />
            </div>
            <p className="muted small">Budgets (énergie / tonnage / calcul)</p>
            <div className="stat-row">
              <NumberInput
                label="Énergie"
                value={form.power}
                onChange={(e) =>
                  setForm({ ...form, power: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Tonnage"
                value={form.tonnage}
                onChange={(e) =>
                  setForm({ ...form, tonnage: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Calcul"
                value={form.calc}
                onChange={(e) =>
                  setForm({ ...form, calc: Number(e.target.value) })
                }
              />
            </div>
            <p className="muted small">Emplacements par type</p>
            <div className="stat-row">
              <NumberInput
                label="Armes"
                value={form.weaponSlots}
                onChange={(e) =>
                  setForm({ ...form, weaponSlots: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Défenses"
                value={form.defenseSlots}
                onChange={(e) =>
                  setForm({ ...form, defenseSlots: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Propulsion"
                value={form.propulsionSlots}
                onChange={(e) =>
                  setForm({ ...form, propulsionSlots: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Utilitaires"
                value={form.utilitySlots}
                onChange={(e) =>
                  setForm({ ...form, utilitySlots: Number(e.target.value) })
                }
              />
            </div>
            <div className="stat-row">
              <NumberInput
                label="Vitesse de base (×)"
                value={form.baseSpeedMult}
                onChange={(e) =>
                  setForm({ ...form, baseSpeedMult: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Carburant de base par saut"
                value={form.baseFuelPerJump}
                onChange={(e) =>
                  setForm({ ...form, baseFuelPerJump: Number(e.target.value) })
                }
              />
              <NumberInput
                label="Temps de fabrication (s)"
                value={form.buildMs / 1000}
                onChange={(e) =>
                  setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
                }
              />
            </div>
            <Field
              label="Tech requise (id, vide = aucune)"
              value={form.requiresTech}
              onChange={(e) =>
                setForm({ ...form, requiresTech: e.target.value })
              }
            />
            <div className="field-textarea-wrap">
              <label htmlFor="chassis-role-bonus">
                Bonus de rôle (JSON, ex. {"{"}"weapon":1.15{"}"} — vide = aucun)
              </label>
              <textarea
                id="chassis-role-bonus"
                className="field-textarea"
                value={form.roleBonusText}
                onChange={(e) =>
                  setForm({ ...form, roleBonusText: e.target.value })
                }
                spellCheck={false}
              />
            </div>
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
