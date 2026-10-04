import type { BabelleVerdict } from "@babelle/data/client";
import { concept } from "../game/data.ts";
import { useLocale } from "../i18n/index.tsx";
import { ConceptIcon } from "./ConceptIcon.tsx";

interface Entry {
  concept: string;
  word: string;
}

/** The words the day has shown in its language, with what they mean. */
export function wordsSeen(verdict: BabelleVerdict): Entry[] {
  const out: Entry[] = [];
  verdict.answers.forEach((answer, i) => {
    const q = verdict.questions[i];
    if (!q) return;
    if (q.kind === "word" || q.kind === "which") out.push({ concept: q.concept, word: q.options[answer.correct] });
    if (q.kind === "meaning") out.push({ concept: q.options[answer.correct], word: q.word });
  });
  return out;
}

/** Clues learned beyond words: a relative, a neighbour, a country. */
function cluesSeen(verdict: BabelleVerdict): Array<{ kind: string; value: string }> {
  const out: Array<{ kind: string; value: string }> = [];
  verdict.answers.forEach((answer, i) => {
    const q = verdict.questions[i];
    if (q && (q.kind === "relative" || q.kind === "neighbour" || q.kind === "country")) {
      out.push({ kind: q.kind, value: q.options[answer.correct] });
    }
  });
  return out;
}

export function Notebook({ verdict }: { verdict: BabelleVerdict | null }): React.ReactElement {
  const { t, name, language } = useLocale();
  const entries = verdict ? wordsSeen(verdict) : [];
  const clues = verdict ? cluesSeen(verdict) : [];
  const region = new Intl.DisplayNames([language], { type: "region" });

  return (
    <section className="notebook">
      <h2 className="notebook__title">{t("notebook")}</h2>
      {entries.length === 0 ? (
        <p className="notebook__empty">{t("notebookEmpty")}</p>
      ) : (
        <ul className="notebook__list">
          {entries.map((entry) => (
            <li key={entry.concept} className="notebook__entry">
              <ConceptIcon id={entry.concept} />
              <span className="notebook__word" lang="und">
                {entry.word}
              </span>
              <span className="notebook__gloss">{concept(entry.concept).labels[language]}</span>
            </li>
          ))}
        </ul>
      )}
      {clues.length > 0 && (
        <ul className="notebook__clues">
          {clues.map((clue) => (
            <li key={clue.kind} className="clue">
              {clue.kind === "country" ? (
                <>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z" />
                    <circle cx="12" cy="10" r="2.3" />
                  </svg>
                  {region.of(clue.value)}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="6" cy="6" r="2.5" />
                    <circle cx="18" cy="18" r="2.5" />
                    <path d="M8 8l8 8" />
                  </svg>
                  {name(clue.value)}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
