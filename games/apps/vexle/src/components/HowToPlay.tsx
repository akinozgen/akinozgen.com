import type { Judged } from "@vexle/data/client";
import { useLocale } from "../i18n/index.tsx";
import { Compass } from "./Compass.tsx";
import { Sheet } from "./Sheet.tsx";

/** Three made-up guesses, to show what the dial means. */
const DEMO: Judged[] = [
  { code: "BR", km: 9800, bearing: 48, proximity: 51 },
  { code: "EG", km: 3100, bearing: 312, proximity: 84 },
  { code: "GR", km: 1200, bearing: 290, proximity: 94 },
];

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

      <div className="rules__compass">
        <Compass results={DEMO} status="playing" className="compass--demo" />
        <div>
          <h3>{t("rulesCompass")}</h3>
          <p>{t("rulesNeedle")}</p>
          <p>{t("rulesDots")}</p>
        </div>
      </div>

      <h3>{t("rulesRows")}</h3>
      <p>{t("rulesRowsText")}</p>

      <h3>{t("rulesHard")}</h3>
      <p>{t("rulesHardText")}</p>

      <p className="muted">{t("rulesDaily")}</p>
    </Sheet>
  );
}
