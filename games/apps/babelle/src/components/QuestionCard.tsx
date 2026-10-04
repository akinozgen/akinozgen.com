import { QUESTIONS, type Question } from "@babelle/data/client";
import { concept } from "../game/data.ts";
import { useLocale } from "../i18n/index.tsx";
import { ConceptIcon } from "./ConceptIcon.tsx";

/** A country's name in the interface language, from the platform. */
function countryName(code: string, ui: string): string {
  return new Intl.DisplayNames([ui], { type: "region" }).of(code) ?? code;
}

/**
 * One question: the prompt, then four cards. Once answered the right card
 * lights up, a wrong pick is marked, and the player moves on when ready.
 */
export function QuestionCard({
  question,
  index,
  result,
  results,
  pending,
  onPick,
  onNext,
}: {
  question: Question;
  index: number;
  /** Set once this question has been answered. */
  result: { chosen: number; correct: number } | null;
  /** Every answer so far, for the progress pips. */
  results: ReadonlyArray<{ chosen: number; correct: number }>;
  pending: boolean;
  onPick: (choice: number) => void;
  onNext: () => void;
}): React.ReactElement {
  const { t, name, language } = useLocale();
  const label = (id: string): string => concept(id).labels[language];

  const prompt =
    question.kind === "word"
      ? t("askWord", { concept: label(question.concept) })
      : question.kind === "meaning"
        ? t("askMeaning")
        : question.kind === "which"
          ? t("askWhich", { concept: label(question.concept) })
          : question.kind === "relative"
            ? t("askRelative")
            : question.kind === "neighbour"
              ? t("askNeighbour")
              : t("askCountry");

  const answered = result !== null;
  const right = answered && result.chosen === result.correct;

  return (
    <section className="question" key={index}>
      <header className="question__head">
        <p className="question__count">{t("questionOf", { n: index + 1, total: QUESTIONS })}</p>
        <ol className="pips" aria-hidden="true">
          {Array.from({ length: QUESTIONS }, (_, i) => {
            const r = results[i];
            const state = r ? (r.chosen === r.correct ? " is-right" : " is-wrong") : i === index ? " is-now" : "";
            return <li key={i} className={`pip${state}`} />;
          })}
        </ol>
      </header>

      <h2 className="question__prompt">{prompt}</h2>

      {(question.kind === "word" || question.kind === "which") && (
        <div className="question__picture">
          <ConceptIcon id={question.concept} />
          <span>{label(question.concept)}</span>
        </div>
      )}
      {question.kind === "meaning" && (
        <div className="question__word" lang="und">
          {question.word}
        </div>
      )}

      <div className={`options options--${question.kind}`}>
        {question.options.map((option, i) => {
          const state = !answered
            ? ""
            : i === result.correct
              ? " is-right"
              : i === result.chosen
                ? " is-wrong"
                : " is-dim";
          return (
            <button
              key={`${index}-${option}`}
              type="button"
              className={`option${state}`}
              disabled={answered || pending}
              onClick={() => onPick(i)}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {question.kind === "meaning" ? (
                <>
                  <ConceptIcon id={option} className="option__icon" />
                  <span className="option__label">{label(option)}</span>
                </>
              ) : question.kind === "relative" || question.kind === "neighbour" ? (
                <span className="option__label">{name(option)}</span>
              ) : question.kind === "country" ? (
                <span className="option__label">{countryName(option, language)}</span>
              ) : (
                <span className="option__word" lang="und">
                  {option}
                </span>
              )}
              {answered && (i === result.correct || i === result.chosen) && (
                <svg viewBox="0 0 24 24" className="option__mark" aria-hidden="true">
                  {i === result.correct ? <path d="M5 12.5 L10 17 L19 7.5" /> : <path d="M7 7 L17 17 M17 7 L7 17" />}
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <footer className={`question__foot${answered ? " is-shown" : ""}`} aria-live="polite">
        {answered && (
          <>
            <p className={`question__verdict${right ? " is-right" : " is-wrong"}`}>{right ? t("right") : t("wrong")}</p>
            <button type="button" className="button button--primary" onClick={onNext} autoFocus>
              {index + 1 < QUESTIONS ? t("next") : t("toFinal")}
            </button>
          </>
        )}
      </footer>
    </section>
  );
}
