import { msUntilNextDay } from "@travelle/core";
import type { BabelleVerdict } from "@babelle/data/client";
import { QUESTIONS } from "@babelle/data/client";
import { useEffect, useState } from "react";
import { familyName } from "../game/data.ts";
import { copyText } from "../game/share.ts";
import { shareText } from "../game/useBabelle.ts";
import { useLocale } from "../i18n/index.tsx";

function useCountdown(): string {
  const [left, setLeft] = useState(() => msUntilNextDay());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(msUntilNextDay()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const total = Math.max(0, Math.floor(left / 1000));
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

/** The day's language revealed, with where to read about it and the share. */
export function EndCard({
  number,
  verdict,
  onNext,
}: {
  number: number;
  verdict: BabelleVerdict;
  /** Endless: deal the next language. Its rounds aren't shared or counted down to. */
  onNext?: () => void;
}): React.ReactElement {
  const { t, name, language } = useLocale();
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown();
  const reveal = verdict.reveal!;
  const won = verdict.status === "won";
  const tries = verdict.guesses.length;
  const right = verdict.answers.filter((a) => a.chosen === a.correct).length;
  const share = shareText(number, verdict);

  return (
    <section className={`end${won ? " is-won" : " is-lost"}`}>
      <p className="end__kicker">{won ? (tries === 1 ? t("wonFirst") : t("wonIn", { n: tries, total: 3 })) : t("lost")}</p>
      <h2 className="end__answer">
        <span className="end__was">{t("answerWas")}</span>
        {name(reveal.language)}
      </h2>
      <p className="end__family">
        {t("family", { family: familyName(reveal.family, language) })} · {t("cardsRight", { n: right, total: QUESTIONS })}
      </p>

      <div className="end__links">
        <a
          className="chip"
          href={`https://${language}.wikipedia.org/wiki/Special:Search?go=Go&search=${encodeURIComponent(name(reveal.language))}`}
          target="_blank"
          rel="noreferrer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" />
            <path d="M5 17a3 3 0 0 1 3-3h10.5" />
          </svg>
          {t("wikipedia")}
        </a>
      </div>

      {onNext ? (
        <button type="button" className="button button--primary end__share" onClick={onNext} autoFocus>
          {t("nextLanguage")}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      ) : (
        <>
        <button
          type="button"
          className="button button--primary end__share"
          onClick={() => {
            if (navigator.share && window.matchMedia?.("(pointer: coarse)").matches) {
              void navigator.share({ text: share }).catch(() => undefined);
              return;
            }
            void copyText(share).then((ok) => {
              setCopied(ok);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="6" r="2.5" />
            <circle cx="18" cy="18" r="2.5" />
            <path d="M8.2 10.9 15.8 7.1M8.2 13.1l7.6 3.8" />
          </svg>
          {copied ? t("copied") : t("share")}
        </button>

        <div className="end__strip" aria-hidden="true">
          {verdict.answers.map((a, i) => (
            <span key={i} className={a.chosen === a.correct ? "is-right" : "is-wrong"} />
          ))}
          <i />
          {verdict.guesses.map((g) => (
            <span key={g.id} className={g.km === 0 ? "is-right" : "is-wrong"} />
          ))}
        </div>

        <p className="end__next">
          {t("nextIn")} <strong>{countdown}</strong>
        </p>
        </>
      )}
    </section>
  );
}
