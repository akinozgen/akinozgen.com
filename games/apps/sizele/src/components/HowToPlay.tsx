import { useLocale } from "../i18n/index.tsx";
import { Sheet } from "./Sheet.tsx";

/** Greenland as Mercator draws it, and as it really is beside Africa. */
function Demo(): React.ReactElement {
  return (
    <svg viewBox="0 0 280 120" className="rules__demo" aria-hidden="true">
      <g className="rules__lines">
        <line x1="0" x2="280" y1="18" y2="18" />
        <line x1="0" x2="280" y1="44" y2="44" />
        <line x1="0" x2="280" y1="66" y2="66" />
        <line x1="0" x2="280" y1="86" y2="86" />
        <line x1="0" x2="280" y1="104" y2="104" />
      </g>
      {/* Mercator's Greenland: huge, up top. */}
      <path className="rules__big" d="M30 8 L92 4 L104 22 L96 44 L76 58 L56 54 L40 36 L26 22 Z" />
      {/* Africa. */}
      <path className="rules__africa" d="M150 30 L196 26 L214 44 L232 50 L222 74 L206 92 L198 112 L184 114 L176 92 L168 74 L150 66 L140 48 Z" />
      {/* Greenland at its true size, set down beside Africa. */}
      <path className="rules__true" d="M236 60 L252 59 L255 64 L253 70 L248 74 L243 73 L239 68 L235 64 Z" />
      <path className="rules__arrow" d="M100 30 C 150 0, 230 10, 244 54" />
      <path className="rules__arrow" d="M238 50 l6 5 1 -8" />
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
      <h3>{t("rulesMap")}</h3>
      <p>{t("rulesMapText")}</p>
      <h3>{t("rulesSlider")}</h3>
      <p>{t("rulesSliderText")}</p>
      <h3>{t("rulesScore")}</h3>
      <p>{t("rulesScoreText")}</p>
      <p className="muted">{t("areaNote")}</p>
      <p className="muted">{t("rulesDaily")}</p>
      <p className="muted">{t("rulesEndless")}</p>
    </Sheet>
  );
}
