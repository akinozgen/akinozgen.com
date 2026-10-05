import { useId } from "react";
import { useLocale } from "../i18n/index.tsx";

/** Hard mode: no names on the pieces. A switch, not a setting buried in a menu. */
export function HardToggle({
  on,
  disabled = false,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}): React.ReactElement {
  const { t } = useLocale();
  const id = useId();
  return (
    <div className="hard">
      <div className="hard__text">
        <label htmlFor={id} className="hard__label">{t("hardMode")}</label>
        <p className="hard__hint">{t("hardModeHint")}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        className={`switch${on ? " is-on" : ""}`}
        disabled={disabled}
        onClick={() => onChange(!on)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}
