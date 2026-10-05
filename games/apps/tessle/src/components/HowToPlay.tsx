import { useLocale } from "../i18n/index.tsx";
import { Sheet } from "./Sheet.tsx";

/** Three pieces drifting towards each other, one still turned: the game in a picture. */
function Demo(): React.ReactElement {
  return (
    <svg viewBox="0 -6 280 136" className="rules__demo" aria-hidden="true">
      <g className="rules__piece rules__piece--a">
        <path d="M30 22 L92 16 L104 44 L88 70 L96 98 L40 104 L22 72 L34 50 Z" />
      </g>
      <g className="rules__piece rules__piece--b">
        <path d="M92 16 L150 24 L158 58 L128 66 L104 44 Z" />
      </g>
      <g className="rules__piece rules__piece--c">
        <path d="M104 44 L128 66 L158 58 L170 92 L96 98 L88 70 Z" />
      </g>
      <path className="rules__turn" d="M258 64 a20 20 0 1 1 -12 -18" />
      <path className="rules__turn" d="M243 40 l4 7 -8 2" />
    </svg>
  );
}

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
      <Demo />

      <h3>{t("rulesMove")}</h3>
      <p>{t("rulesMoveText")}</p>

      <h3>{t("rulesFit")}</h3>
      <p>{t("rulesFitText")}</p>

      <h3>{t("rulesView")}</h3>
      <p>{t("rulesViewText")}</p>

      <h3>{t("rulesHard")}</h3>
      <p>{t("rulesHardText")}</p>

      <p className="muted">{t("rulesDaily")}</p>
      <p className="muted">{t("rulesEndless")}</p>
    </Sheet>
  );
}
