import { useLocale } from "../i18n/index.tsx";
import type { StringKey } from "../i18n/strings.ts";
import { type Game, HINTS, type Hint } from "../game/useGame.ts";

const LABEL: Record<Hint, StringKey> = {
  neighbours: "hintNeighbours",
  "next-outline": "hintOutline",
  "all-outlines": "hintOutlines",
  initials: "hintInitials",
};

export function Hints({
  used,
  disabled,
  initials,
  onUse,
}: {
  used: readonly Hint[];
  disabled: boolean;
  initials: Game["initials"];
  onUse: (hint: Hint) => void;
}): React.ReactElement {
  const { t, language } = useLocale();
  const letters = used.includes("initials") && initials ? initials[language] : null;

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
      {letters !== null && (
        <p className="hints__initials">{letters.length > 0 ? letters : t("routeComplete")}</p>
      )}
    </section>
  );
}
