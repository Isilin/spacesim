import { MODULE_ROLES, SLOT_TYPES, type UpsertModuleInput } from "@spacesim/protocol";
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

interface Module {
  id: string;
  nameFr: string;
  descriptionFr: string;
  slot: string;
  role: string;
  power: number;
  tonnage: number;
  calc: number;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
  effects: Record<string, unknown>;
}

interface Props {
  token: string;
}

const SLOT_LABELS: Record<string, string> = {
  weapon: "Arme",
  defense: "Défense",
  propulsion: "Propulsion",
  utility: "Utilitaire",
};

const ROLE_LABELS: Record<string, string> = {
  weapon: "Arme",
  defense: "Défense",
  propulsion: "Propulsion",
  cargo: "Cargo",
  mining: "Minage",
  habitat: "Habitat",
  support: "Soutien",
  sensor: "Senseur",
};

interface ModuleForm {
  nameFr: string;
  descriptionFr: string;
  slot: UpsertModuleInput["slot"];
  role: UpsertModuleInput["role"];
  power: number;
  tonnage: number;
  calc: number;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string;
  effectsText: string;
}

function emptyForm(): ModuleForm {
  return {
    nameFr: "",
    descriptionFr: "",
    slot: "weapon",
    role: "weapon",
    power: 10,
    tonnage: 5,
    calc: 4,
    cost: {},
    buildMs: 8_000,
    requiresTech: "",
    effectsText: "{}",
  };
}

function formFromModule(m: Module): ModuleForm {
  return {
    nameFr: m.nameFr,
    descriptionFr: m.descriptionFr,
    slot: m.slot as UpsertModuleInput["slot"],
    role: m.role as UpsertModuleInput["role"],
    power: m.power,
    tonnage: m.tonnage,
    calc: m.calc,
    cost: m.cost,
    buildMs: m.buildMs,
    requiresTech: m.requiresTech ?? "",
    effectsText: JSON.stringify(m.effects, null, 2),
  };
}

/**
 * CMS de contenu (chantier 23.10) — modules de vaisseau. `effects` en JSON brut (10
 * champs optionnels de `ModuleEffects`), même choix que les effets de tech (23.9).
 */
export function ModulesView({ token }: Props) {
  const [modules, setModules] = useState<Module[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(null);
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<ModuleForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/modules", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body: { modules?: Module[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setModules(body.modules ?? []);
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

  const openEdit = (m: Module) => {
    setEditing({ id: m.id, isNew: false });
    setForm(formFromModule(m));
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
    const payload: UpsertModuleInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      slot: form.slot,
      role: form.role,
      power: form.power,
      tonnage: form.tonnage,
      calc: form.calc,
      cost: form.cost,
      buildMs: form.buildMs,
      requiresTech: form.requiresTech.trim() || null,
      effects: effects as UpsertModuleInput["effects"],
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/content/modules/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Erreur serveur");
        return;
      }
      setModules(body.modules);
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

  const columns: TableColumn<Module>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    { key: "slot", label: "Emplacement", render: (v) => SLOT_LABELS[v as string] ?? (v as string) },
    { key: "role", label: "Rôle", render: (v) => ROLE_LABELS[v as string] ?? (v as string) },
    { key: "requiresTech", label: "Tech requise", render: (v) => (v as string | null) ?? "—" },
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
    <Panel title="Modules" actions={<Button onClick={openCreate}>Nouveau</Button>}>
      {error && <p className="auth-error">{error}</p>}
      {!error && modules === null && <p className="muted">Chargement…</p>}
      {!error && modules && <Table columns={columns} rows={modules} />}

      {editing && (
        <Modal
          title={editing.isNew ? "Nouveau module" : `Modifier « ${editing.id} »`}
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
              label="Id (identifiant technique, ex. quantum_scanner)"
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
          <div className="stat-row">
            <Select
              label="Emplacement"
              value={form.slot}
              onChange={(e) =>
                setForm({ ...form, slot: e.target.value as UpsertModuleInput["slot"] })
              }
              options={SLOT_TYPES.map((s) => ({ value: s, label: SLOT_LABELS[s] ?? s }))}
            />
            <Select
              label="Rôle"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as UpsertModuleInput["role"] })
              }
              options={MODULE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }))}
            />
          </div>
          <p className="muted small">Budgets consommés</p>
          <div className="stat-row">
            <NumberInput
              label="Énergie"
              value={form.power}
              onChange={(e) => setForm({ ...form, power: Number(e.target.value) })}
            />
            <NumberInput
              label="Tonnage"
              value={form.tonnage}
              onChange={(e) => setForm({ ...form, tonnage: Number(e.target.value) })}
            />
            <NumberInput
              label="Calcul"
              value={form.calc}
              onChange={(e) => setForm({ ...form, calc: Number(e.target.value) })}
            />
          </div>
          <NumberInput
            label="Temps de fabrication (s)"
            value={form.buildMs / 1000}
            onChange={(e) => setForm({ ...form, buildMs: Number(e.target.value) * 1000 })}
          />
          <Field
            label="Tech requise (id, vide = aucune)"
            value={form.requiresTech}
            onChange={(e) => setForm({ ...form, requiresTech: e.target.value })}
          />
          <div className="field-textarea-wrap">
            <label htmlFor="module-effects">Effets (JSON — champs de ModuleEffects)</label>
            <textarea
              id="module-effects"
              className="field-textarea"
              value={form.effectsText}
              onChange={(e) => setForm({ ...form, effectsText: e.target.value })}
              spellCheck={false}
            />
          </div>
          <p className="muted small">Coût de construction (ajouté au châssis)</p>
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
        </Modal>
      )}
    </Panel>
  );
}
