import { MARK_EMOJI, type GuessResult } from "@travelle/geo";
import { useLocale } from "../i18n/index.tsx";
import type { StringKey } from "../i18n/strings.ts";

const EXPLANATION: Record<GuessResult["mark"], StringKey> = {
  chain: "markChain",
  closer: "markCloser",
  detour: "markDetour",
  wrong: "markWrong",
};

export function GuessList({ results }: { results: readonly GuessResult[] }): React.ReactElement {
  const { t, name } = useLocale();
  if (results.length === 0) {
    return <p className="guesses__empty">{t("noGuessesYet")}</p>;
  }

  return (
    <ol className="guesses">
      {results.map((result, index) => (
        <li key={result.region} className={`guess guess--${result.mark}`}>
          <span className="guess__index">{index + 1}</span>
          <span className="guess__mark" title={t(EXPLANATION[result.mark])}>
            {MARK_EMOJI[result.mark]}
          </span>
          <span className="guess__name">{name(result.region)}</span>
        </li>
      ))}
    </ol>
  );
}
