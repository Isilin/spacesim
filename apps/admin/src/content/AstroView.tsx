import {
  ASTRO_FAMILIES,
  BELT_TYPE_DEFS,
  BLACK_HOLE_TYPES,
  GALAXY_TYPES,
  MOON_CLASS_DEFS,
  MOON_VARIANT_DEFS,
  PLANET_CLASS_DEFS,
  PLANET_VARIANT_DEFS,
  STAR_CLASSES,
  WHITE_HOLE_TYPES,
  type AstroFamily,
} from "@spacesim/shared";
import {
  Button,
  Field,
  Modal,
  Panel,
  Select,
  Skeleton,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getGetApiAdminContentAstroQueryKey,
  useGetApiAdminContentAstro,
  usePutApiAdminContentAstroFamilyId,
} from "../api/generated/admin.js";

/**
 * CMS des catalogues astronomiques (chantier 45.4).
 *
 * ## Une vue, neuf familles
 *
 * Les douze domaines précédents ont chacun leur onglet parce qu'ils sont des objets
 * différents : un vaisseau de guerre n'a rien à voir avec un jalon. Les neuf familles
 * astronomiques sont un seul objet — un type qui porte des multiplicateurs et des couleurs —
 * décliné par famille. Neuf onglets de trois champs auraient dispersé sans rien clarifier.
 *
 * ## Ce que l'écran montre, et pourquoi
 *
 * Chaque ligne affiche la valeur INTÉGRÉE à côté de la valeur surchargée. C'est ce qui rend
 * la moitié gelée de l'ADR 0021 lisible sans ouvrir le code : ce qui n'apparaît pas ici n'est
 * pas éditable, et l'éditeur voit du même coup ce qu'il change et ce dont il part.
 *
 * Une entrée sans surcharge n'a aucune ligne en base. Vider un champ le remet à sa valeur
 * intégrée, plutôt que d'écrire un zéro qui n'aurait pas le même sens.
 */

/** Les champs éditables par famille, dans l'ordre d'affichage. Miroir d'`AstroOverrides`. */
const FAMILY_FIELDS: Record<
  AstroFamily,
  readonly { key: string; kind: "number" | "color" | "boolean" }[]
> = {
  galaxy: [{ key: "tint", kind: "color" }],
  star: [
    { key: "depositMult", kind: "number" },
    { key: "energyMult", kind: "number" },
    { key: "core", kind: "color" },
    { key: "edge", kind: "color" },
    { key: "halo", kind: "color" },
    { key: "light", kind: "color" },
    { key: "radius", kind: "number" },
    { key: "corona", kind: "number" },
    { key: "intensity", kind: "number" },
    { key: "churn", kind: "number" },
    { key: "dark", kind: "boolean" },
  ],
  blackHole: [
    { key: "depositMult", kind: "number" },
    { key: "energyMult", kind: "number" },
    { key: "exoticYield", kind: "number" },
    { key: "hazard", kind: "number" },
    { key: "discRadius", kind: "number" },
    { key: "horizonRadius", kind: "number" },
    { key: "halo", kind: "color" },
    { key: "light", kind: "color" },
    { key: "intensity", kind: "number" },
  ],
  whiteHole: [
    { key: "depositMult", kind: "number" },
    { key: "energyMult", kind: "number" },
    { key: "exoticYield", kind: "number" },
    { key: "hazard", kind: "number" },
    { key: "discRadius", kind: "number" },
    { key: "mouthRadius", kind: "number" },
    { key: "halo", kind: "color" },
    { key: "light", kind: "color" },
    { key: "intensity", kind: "number" },
  ],
  planetClass: [
    { key: "renderRadius", kind: "number" },
    { key: "labelExtent", kind: "number" },
    { key: "ringChance", kind: "number" },
    { key: "relief", kind: "number" },
    { key: "roughness", kind: "number" },
  ],
  planetVariant: [
    { key: "color", kind: "color" },
    { key: "accent", kind: "color" },
  ],
  moonClass: [
    { key: "renderRadius", kind: "number" },
    { key: "labelExtent", kind: "number" },
    { key: "ringChance", kind: "number" },
    { key: "relief", kind: "number" },
    { key: "roughness", kind: "number" },
  ],
  moonVariant: [
    { key: "color", kind: "color" },
    { key: "accent", kind: "color" },
  ],
  belt: [
    { key: "hazard", kind: "number" },
    { key: "tint", kind: "color" },
    { key: "density", kind: "number" },
  ],
};

/**
 * Les définitions intégrées, pour afficher ce dont une surcharge part.
 *
 * `object` et non `Record<string, unknown>` : les neuf tables ont neuf formes, et une interface
 * TypeScript n'a pas de signature d'index. La lecture par nom de champ passe donc par
 * `fieldOf`, un seul endroit où la conversion est écrite et justifiée.
 */
const BUILTIN: Record<AstroFamily, Record<string, object>> = {
  galaxy: GALAXY_TYPES,
  star: STAR_CLASSES,
  blackHole: BLACK_HOLE_TYPES,
  whiteHole: WHITE_HOLE_TYPES,
  planetClass: PLANET_CLASS_DEFS,
  planetVariant: PLANET_VARIANT_DEFS,
  moonClass: MOON_CLASS_DEFS,
  moonVariant: MOON_VARIANT_DEFS,
  belt: BELT_TYPE_DEFS,
};

/** Lit un champ d'une définition intégrée. Les tables sont typées entrée par entrée ; ici on
 *  ne connaît que le nom du champ, choisi dans `FAMILY_FIELDS` — donc validé par construction. */
function fieldOf(entry: object | undefined, key: string): unknown {
  return entry ? (entry as Record<string, unknown>)[key] : undefined;
}

interface Row {
  id: string;
  builtin: object;
  override: Record<string, unknown>;
}

/** Un champ de formulaire vide veut dire « pas de surcharge », jamais « zéro ». */
type Draft = Record<string, string>;

function draftFrom(override: Record<string, unknown>): Draft {
  return Object.fromEntries(
    Object.entries(override).map(([key, value]) => [key, String(value)]),
  );
}

export function AstroView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentAstro();
  const mutation = usePutApiAdminContentAstroFamilyId();
  const [family, setFamily] = useState<AstroFamily>("star");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const overrides = new Map(
    (data?.astro ?? [])
      .filter((row) => row.family === family)
      .map((row) => [row.id, row.payload as Record<string, unknown>]),
  );

  const rows: Row[] = Object.keys(BUILTIN[family]).map((id) => ({
    id,
    builtin: BUILTIN[family][id] ?? {},
    override: overrides.get(id) ?? {},
  }));

  const fields = FAMILY_FIELDS[family];

  const openEdit = (row: Row) => {
    setEditing(row.id);
    setDraft(draftFrom(row.override));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    setSubmitError(null);
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = draft[field.key]?.trim();
      // Vide = pas de surcharge : le champ disparaît du correctif et la valeur intégrée
      // reprend la main. C'est la seule façon d'annuler une édition sans écrire une valeur.
      if (!raw) continue;
      payload[field.key] =
        field.kind === "number"
          ? Number(raw)
          : field.kind === "boolean"
            ? raw === "true"
            : raw;
    }
    try {
      const result = await mutation.mutateAsync({
        family,
        id: editing,
        // `family` est le discriminant du contrat : il voyage dans le chemin ET le corps.
        data: { ...payload, family } as never,
      });
      queryClient.setQueryData(getGetApiAdminContentAstroQueryKey(), result);
      setEditing(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  const columns: TableColumn<Row>[] = [
    { key: "id", label: t("contentCommon.id") },
    ...fields.map<TableColumn<Row>>((field) => ({
      key: field.key,
      label: field.key,
      render: (_v, row) => {
        const overridden = row.override[field.key];
        const base = fieldOf(row.builtin, field.key);
        return overridden === undefined ? (
          <span className="muted">{String(base ?? "—")}</span>
        ) : (
          <strong>{String(overridden)}</strong>
        );
      },
    })),
    {
      key: "actions",
      label: "",
      render: (_v, row) => (
        <Button variant="link" onClick={() => openEdit(row)}>
          {t("contentCommon.edit")}
        </Button>
      ),
    },
  ];

  return (
    <Panel title={t("astroView.title")}>
      <p className="small muted">{t("astroView.frozenHint")}</p>
      <Select
        label={t("astroView.family")}
        value={family}
        onChange={(e) => setFamily(e.target.value as AstroFamily)}
        options={ASTRO_FAMILIES.map((value) => ({
          value,
          label: t(`astroView.family_${value}`),
        }))}
      />
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("astroView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={rows} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            closeLabel={t("contentCommon.close")}
            title={t("contentCommon.editTitle", { id: editing })}
          />
          <Modal.Body>
            <p className="small muted">{t("astroView.emptyResets")}</p>
            {fields.map((field) => (
              <Field
                key={field.key}
                label={`${field.key} — ${String(
                  fieldOf(BUILTIN[family][editing], field.key) ?? "—",
                )}`}
                value={draft[field.key] ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, [field.key]: e.target.value })
                }
              />
            ))}
            {submitError && <p className="auth-error">{submitError}</p>}
          </Modal.Body>
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t("contentCommon.cancel")}
            </Button>
            <Button disabled={mutation.isPending} onClick={() => void submit()}>
              {mutation.isPending
                ? t("contentCommon.saving")
                : t("contentCommon.save")}
            </Button>
          </Modal.Actions>
        </Modal>
      )}
    </Panel>
  );
}
