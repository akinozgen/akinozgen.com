import { MARK_EMOJI } from "@travelle/geo";
import { useLocale } from "../i18n/index.tsx";
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
      <p>{t("rulesAim")}</p>

      <h3>{t("rulesMarks")}</h3>
      <ul className="legend">
        <li>
          <span>{MARK_EMOJI.chain}</span> {t("rulesChain")}
        </li>
        <li>
          <span>{MARK_EMOJI.closer}</span> {t("rulesCloser")}
        </li>
        <li>
          <span>{MARK_EMOJI.detour}</span> {t("rulesDetour")}
        </li>
        <li>
          <span>{MARK_EMOJI.wrong}</span> {t("rulesWrong")}
        </li>
      </ul>
      <p className="muted">{t("rulesJudged")}</p>

      <h3>{t("rulesBorders")}</h3>
      <ul className="legend">
        <li>{t("rulesLand")}</li>
        <li>{t("rulesCrossings")}</li>
        <li>{t("rulesHopping")}</li>
      </ul>

      <h3>{t("rulesModes")}</h3>
      <ul className="legend">
        <li>{t("rulesDaily")}</li>
        <li>{t("rulesEndless")}</li>
      </ul>
    </Sheet>
  );
}
