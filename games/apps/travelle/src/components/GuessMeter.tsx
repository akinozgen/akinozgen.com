import type { GuessResult } from "@travelle/geo";
import { plural, useLocale } from "../i18n/index.tsx";

/**
 * Guesses left, as pips rather than a sentence. Spent ones carry the colour
 * they earned, so the row doubles as a record of how the round has gone.
 */
export function GuessMeter({
  results,
  budget,
}: {
  results: readonly GuessResult[];
  budget: number;
}): React.ReactElement {
  const { t } = useLocale();
  const used = results.length;
  const left = budget - used;

  return (
    <div className="meter">
      <p className="meter__label">
        <span className="visually-hidden">{t("guessOf", { n: used + 1, total: budget })}</span>
        <span aria-hidden="true">{plural(t, left, "guessesLeftOne", "guessesLeftMany")}</span>
      </p>
      <ol className="meter__pips" aria-hidden="true">
        {Array.from({ length: budget }, (_, index) => {
          const result = results[index];
          const state = result ? `is-${result.mark}` : index < used ? "is-used" : "is-free";
          return <li key={index} className={`pip ${state}`} />;
        })}
      </ol>
    </div>
  );
}
