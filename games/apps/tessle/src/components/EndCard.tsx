import { msUntilNextDay } from "@travelle/core";
import { useEffect, useState } from "react";
import { copyText } from "../game/share.ts";
import { clock, shareText, type Status } from "../game/useTessle.ts";
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

/** What follows a finished round: the time, the countries, and the share. */
export function EndCard({
  number,
  status,
  ids,
  elapsed,
  moves,
  hardAll,
  onNext,
}: {
  number: number;
  status: Status;
  ids: string[];
  elapsed: number;
  moves: number;
  hardAll: boolean;
  /** Endless: deal the next map. Its rounds aren't shared or counted down to. */
  onNext?: () => void;
}): React.ReactElement {
  const { t, name, language } = useLocale();
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown();
  const won = status === "won";
  const share = shareText(number, status, ids.length, elapsed, moves, {
    moves: t("shareMoves"),
    gaveUp: t("shareGaveUp"),
    hard: won && hardAll ? t("hardTag") : null,
  });
  const sorted = [...ids].sort((a, b) => name(a).localeCompare(name(b), language));

  return (
    <section className={`end${won ? " is-won" : " is-lost"}`}>
      <p className="end__kicker">{won ? t("solvedIn", { time: clock(elapsed) }) : t("shown")}</p>
      {won && (
        <p className="end__moves">
          {t("solvedMoves", { n: moves })}
          {hardAll && <span className="end__tag">{t("hardTag")}</span>}
        </p>
      )}

      <h3 className="end__title">{t("mapWas")}</h3>
      <ul className="end__countries">
        {sorted.map((id) => (
          <li key={id}>
            <a
              className="chip"
              href={`https://${language}.wikipedia.org/wiki/Special:Search?go=Go&search=${encodeURIComponent(name(id))}`}
              target="_blank"
              rel="noreferrer"
            >
              {name(id)}
            </a>
          </li>
        ))}
      </ul>

      {onNext ? (
        <button type="button" className="button button--primary end__share" onClick={onNext} autoFocus>
          {t("nextMap")}
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
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="6" r="2.5" />
              <circle cx="18" cy="18" r="2.5" />
              <path d="M8.2 10.9 15.8 7.1M8.2 13.1l7.6 3.8" />
            </svg>
            {copied ? t("copied") : t("share")}
          </button>
          <p className="end__next">
            {t("nextIn")} <strong>{countdown}</strong>
          </p>
        </>
      )}
    </section>
  );
}
