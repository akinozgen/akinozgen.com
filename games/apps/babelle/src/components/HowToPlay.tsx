import { useLocale } from "../i18n/index.tsx";
import { ConceptIcon } from "./ConceptIcon.tsx";
import { Sheet } from "./Sheet.tsx";

export function HowToPlay({ onClose }: { onClose: () => void }): React.ReactElement {
  const { t } = useLocale();
  return (
    <Sheet
      title={t("rules")}
      onClose={onClose}
      footer={
        <button type="button" className="button button--primary" onClick={onClose}>
          {t("gotIt")}
        </button>
      }
    >
      <p className="rules__lead">{t("rulesAim")}</p>
      <div className="rules__demo" aria-hidden="true">
        {["tree", "water", "sun", "fish"].map((id) => (
          <span key={id} className="rules__card">
            <ConceptIcon id={id} />
          </span>
        ))}
      </div>
      <h3>{t("rulesCards")}</h3>
      <p>{t("rulesCardsText")}</p>
      <h3>{t("rulesFinal")}</h3>
      <p>{t("rulesFinalText")}</p>
      <p className="muted">{t("rulesDaily")}</p>
      <p className="muted">{t("rulesEndless")}</p>
    </Sheet>
  );
}
