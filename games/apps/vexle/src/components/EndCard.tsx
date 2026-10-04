import { msUntilNextDay } from "@travelle/core";
import type { VexleVerdict } from "@vexle/data/client";
import { useEffect, useState } from "react";
import { country } from "../game/countries.ts";
import { copyText } from "../game/share.ts";
import { shareText } from "../game/useVexle.ts";
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

/** What follows a finished round: the answer, where to read about it, and the share. */
export function EndCard({
  number,
  verdict,
  guesses,
  hardAll,
}: {
  number: number;
  verdict: VexleVerdict;
  guesses: number;
  hardAll: boolean;
}): React.ReactElement {
  const { t, name, language } = useLocale();
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown();
  const won = verdict.status === "won";
  const answer = verdict.answer!;
  const english = country(answer).names.en;
  const share = shareText(number, verdict, guesses, won && hardAll ? t("hardTag") : null);
  const spent = new Set(verdict.opened.slice(0, won ? guesses - 1 : 6));

  return (
    <section className={`end${won ? " is-won" : " is-lost"}`}>
      <p className="end__kicker">{won ? (guesses === 1 ? t("wonFirst") : t("wonIn", { n: guesses, total: 6 })) : t("lost")}</p>
      <h2 className="end__answer">
        <span className="end__was">{t("answerWas")}</span>
        {name(answer)}
      </h2>

      <div className="end__links">
        <a
          className="chip"
          href={`https://${language}.wikipedia.org/wiki/Special:Search?go=Go&search=${encodeURIComponent(name(answer))}`}
          target="_blank"
          rel="noreferrer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10.5" /></svg>
          {t("wikipedia")}
        </a>
        <a
          className="chip"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(english)}`}
          target="_blank"
          rel="noreferrer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z" /><circle cx="12" cy="10" r="2.3" /></svg>
          {t("map")}
        </a>
      </div>

      <button
        type="button"
        className="button button--primary end__share"
        onClick={() => {
          // Phones get the system share sheet; everything else, the clipboard.
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
          <circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" />
          <path d="M8.2 10.9 15.8 7.1M8.2 13.1l7.6 3.8" />
        </svg>
        {copied ? t("copied") : t("share")}
      </button>
      <div className="end__grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={spent.has(i) ? "is-spent" : ""} />
        ))}
      </div>

      <p className="end__next">
        {t("nextIn")} <strong>{countdown}</strong>
      </p>
    </section>
  );
}
