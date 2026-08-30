import type { Appearance } from "@spacesim/protocol";
import { Button, Field, NumberInput } from "@spacesim/ui";
import { useTranslation } from "react-i18next";

/**
 * Édition de l'apparence 3D d'une entrée de contenu (chantier 31.22).
 *
 * Partagé par les domaines manufacturés qui ont un rendu paramétrique. L'absence
 * d'apparence est un état de premier rang, pas un formulaire vide : `null` signifie
 * explicitement « repli générique du moteur », ce qui permet de créer une entrée depuis
 * l'admin sans coder et d'obtenir quand même quelque chose de visible.
 */
const DEFAULT_APPEARANCE: NonNullable<Appearance> = {
  color: "#8a8f98",
  accent: null,
  scale: 1,
};

export function AppearanceFields({
  value,
  onChange,
}: {
  value: Appearance;
  onChange: (next: Appearance) => void;
}) {
  const { t } = useTranslation();

  if (!value) {
    return (
      <div className="stat-row">
        <p className="muted small">{t("appearance.usingFallback")}</p>
        <Button onClick={() => onChange(DEFAULT_APPEARANCE)}>
          {t("appearance.customise")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <p className="muted small">{t("appearance.title")}</p>
      <Field
        label={t("appearance.color")}
        value={value.color}
        onChange={(e) => onChange({ ...value, color: e.target.value })}
      />
      <Field
        label={t("appearance.accent")}
        value={value.accent ?? ""}
        onChange={(e) =>
          onChange({ ...value, accent: e.target.value.trim() || null })
        }
      />
      <NumberInput
        label={t("appearance.scale")}
        min={0.1}
        max={5}
        step={0.1}
        value={value.scale}
        onChange={(e) => onChange({ ...value, scale: Number(e.target.value) })}
      />
      <Button variant="ghost" onClick={() => onChange(null)}>
        {t("appearance.reset")}
      </Button>
    </>
  );
}
