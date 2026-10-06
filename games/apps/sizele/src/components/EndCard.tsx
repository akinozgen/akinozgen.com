import { msUntilNextDay } from "@travelle/core";
import { band, ROUNDS, type Result, type RoundInfo } from "@sizele/data/client";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../game/share.ts";
import { ratioText } from "../game/ratio.ts";
import { biggestLie, storyCard } from "../game/storyCard.ts";
import { shareText } from "../game/useSizele.ts";
import { useLocale } from "../i18n/index.tsx";
import { useRatio } from "./GuessPanel.tsx";

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

/** The day's total, round by round, and the share. */
export function EndCard({
  number,
  date,
  total,
  results,
  rounds,
  hardAll,
  onNext,
}: {
  number: number;
  date: string;
  total: number;
  results: Result[];
  rounds: RoundInfo[];
  hardAll: boolean;
  /** Endless: deal another set. Its scores aren't shared or counted down to. */
  onNext?: () => void;
}): React.ReactElement {
  const { t, name, language } = useLocale();
  const format = useRatio();
  const [copied, setCopied] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const shareRef = useRef<HTMLButtonElement>(null);
  // The keyboard lands on Share, without scrolling the page away.
  useEffect(() => shareRef.current?.focus({ preventScroll: true }), []);
  const countdown = useCountdown();
  const share = shareText(number, total, results, hardAll ? t("hardTag") : null);

  /** The story picture: the day's biggest lie, the score, the squares. */
  const sharePicture = async (): Promise<void> => {
    setDrawing(true);
    try {
      const pick = results[biggestLie(results)];
      const when = new Date(`${date}T12:00:00`).toLocaleDateString(language, { day: "numeric", month: "long" });
      const blob = await storyCard(
        results,
        rounds,
        total,
        {
          title: `#${number} · ${when}${hardAll ? ` · ${t("hardTag")}` : ""}`,
          line: t("storyLine", { target: name(pick.target), n: ratioText(pick.ratio, language), unit: name(pick.unit) }),
          mapSaid: t("storyMap", { n: ratioText(pick.apparent, language) }),
          score: t("outOf", { n: ROUNDS * 100 }),
        },
        { unit: name(pick.unit), target: name(pick.target) },
      );
      if (!blob) return;
      const file = new File([blob], `sizele-${number}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: share }).catch(() => undefined);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setDrawing(false);
    }
  };

  return (
    <section className="end">
      <p className="end__kicker">{onNext ? t("endlessScore") : t("todayScore")}</p>
      <p className="end__total">
        <strong>{total}</strong>
        <span>{t("outOf", { n: ROUNDS * 100 })}</span>
      </p>
      <p className="end__head" aria-hidden="true">
        <span>{t("roundsPair")}</span>
        <span>{t("roundsNums")}</span>
        <span>{t("points")}</span>
      </p>
      <ol className="end__rounds">
        {results.map((result, i) => (
          <li key={i} className={`end__round end__round--${band(result.score)}`}>
            <span className="end__pair">
              {name(result.target)} <span className="end__vs">/</span> {name(result.unit)}
            </span>
            <span className="end__nums">
              ×{format(result.guess)} <span className="end__arrow">→</span> ×{format(result.ratio)}
            </span>
            <span className="end__score">{result.score}</span>
          </li>
        ))}
      </ol>

      {onNext ? (
        <button type="button" className="button button--primary end__share" onClick={onNext} autoFocus>
          {t("nextSet")}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      ) : (
        <>
          <button
            ref={shareRef}
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
          <button type="button" className="button end__picture" onClick={() => void sharePicture()} disabled={drawing}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="3" width="16" height="18" rx="3" />
              <circle cx="9.5" cy="9" r="2" />
              <path d="M5 18l4.5-4.5 3 3 2.5-2.5L20 19" />
            </svg>
            {t("picture")}
          </button>
          <p className="end__next">
            {t("nextIn")} <strong>{countdown}</strong>
          </p>
        </>
      )}
    </section>
  );
}
