import { useLocale } from "../i18n/index.tsx";
import type { StringKey } from "../i18n/strings.ts";
import { HINTS, type Hint } from "../game/useGame.ts";

const LABEL: Record<Hint, StringKey> = {
  neighbours: "hintNeighbours",
  "next-outline": "hintOutline",
  "all-outlines": "hintOutlines",
  initials: "hintInitials",
};

export function Hints({
  used,
  disabled,
  suggestion,
  onUse,
}: {
  used: readonly Hint[];
  disabled: boolean;
  suggestion: readonly string[];
  onUse: (hint: Hint) => void;
}): React.ReactElement {
  const { t, name } = useLocale();
  const initials = used.includes("initials")
    ? suggestion.map((id) => name(id).charAt(0)).join(" · ")
    : null;

  return (
    <section className="hints">
      <h2 className="hints__title">
        {t("hints")} <span className="hints__count">{used.length}/{HINTS.length}</span>
      </h2>
      <div className="hints__row">
        {HINTS.map((hint) => (
          <button
            key={hint}
            type="button"
            className="hints__button"
            disabled={disabled || used.includes(hint)}
            onClick={() => onUse(hint)}
          >
            {t(LABEL[hint])}
          </button>
        ))}
      </div>
      {initials !== null && (
        <p className="hints__initials">
          {initials.length > 0 ? initials : t("routeComplete")}
        </p>
      )}
    </section>
  );
}
