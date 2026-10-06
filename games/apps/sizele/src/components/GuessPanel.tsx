import { band, RATIO_MAX, RATIO_MIN, type Result, type RoundInfo } from "@sizele/data/client";
import { useEffect, useId, useRef, useState } from "react";
import { nice, ratioText, step } from "../game/ratio.ts";
import { useLocale } from "../i18n/index.tsx";
import { Confetti } from "./Confetti.tsx";

const LOG_MIN = Math.log(RATIO_MIN);
const LOG_MAX = Math.log(RATIO_MAX);
/** Slider steps across the whole range. */
const STEPS = 1000;

const toSlider = (ratio: number): number => Math.round(((Math.log(ratio) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * STEPS);
const fromSlider = (value: number): number => nice(Math.exp(LOG_MIN + (value / STEPS) * (LOG_MAX - LOG_MIN)));

/** A ratio as people say it, in the player's language: "2,5", "1/7". */
export function useRatio(): (n: number) => string {
  const { language } = useLocale();
  return (n: number) => ratioText(n, language);
}

/** Areas the way a class would read them out: "2.14 million km²", "779,000 km²". */
function useArea(): (km2: number) => string {
  const { language } = useLocale();
  return (km2: number) =>
    `${new Intl.NumberFormat(language, {
      notation: km2 >= 1e6 ? "compact" : "standard",
      compactDisplay: "long",
      maximumSignificantDigits: 3,
    }).format(km2)}\u00a0km²`;
}

/** Counts up to the score, so it lands rather than appears. */
function useCountUp(target: number, run: boolean): number {
  const [shown, setShown] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / 650);
      setShown(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return shown;
}

/** One round: the question, the slider, and — once the country has landed — what the map hid. */
export function GuessPanel({
  round,
  index,
  total,
  result,
  landed,
  pending,
  last,
  draft,
  named,
  onDraft,
  onGuess,
  onNext,
}: {
  round: RoundInfo;
  index: number;
  total: number;
  result: Result | null;
  /** The true-size move has finished on the map: the numbers may show. */
  landed: boolean;
  pending: boolean;
  last: boolean;
  /** A guess set but not yet sent, kept across a reload. */
  draft: number | null;
  /** Names shown; hard mode calls them by their colours until the reveal. */
  named: boolean;
  onDraft: (ratio: number) => void;
  onGuess: (ratio: number) => void;
  onNext: () => void;
}): React.ReactElement {
  const { t, name } = useLocale();
  const ratio = useRatio();
  const id = useId();
  const [value, setValue] = useState(() => draft ?? 1);
  const sliderRef = useRef<HTMLInputElement>(null);
  // Each round starts even, one for one, unless a guess was left set; the
  // keyboard lands on the slider, ready.
  useEffect(() => {
    setValue(draft ?? 1);
    if (index > 0) sliderRef.current?.focus({ preventScroll: true });
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (next: number): void => {
    setValue(next);
    onDraft(next);
  };

  const targetName = named ? name(round.target.id) : t("amber");
  const unitName = named ? name(round.unit.id) : t("blue");
  const target = <span className="chip-name chip-name--target">{targetName}</span>;
  const unit = <span className="chip-name chip-name--unit">{unitName}</span>;
  const question = named ? t("question") : t("questionHidden");
  const [before, middle, after] = question.split(/\{target\}|\{unit\}/);
  const unitFirst = question.indexOf("{unit}") < question.indexOf("{target}");

  return (
    <section className="round" aria-live="polite">
      <p className="round__step">{t("roundOf", { n: index + 1, total })}</p>
      <h2 className="round__question">
        {before}
        {unitFirst ? unit : target}
        {middle}
        {unitFirst ? target : unit}
        {after}
      </h2>

      {!result ? (
        <form
          className="slider"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) onGuess(value);
          }}
        >
          <output className="slider__value" htmlFor={id}>
            <span className="slider__times">×</span>
            {ratio(value)}
          </output>
          <p className="slider__reading">
            {t("reading", { target: targetName, n: ratio(value), unit: unitName })}
          </p>
          <div className="slider__row">
            <button type="button" className="slider__nudge" aria-label={t("smaller")} onClick={() => choose(step(value, -1))}>
              −
            </button>
            <input
              ref={sliderRef}
              id={id}
              type="range"
              className="slider__input"
              min={0}
              max={STEPS}
              step={1}
              value={toSlider(value)}
              aria-label={t("guessLabel")}
              aria-valuetext={ratio(value)}
              onChange={(event) => choose(fromSlider(Number(event.target.value)))}
              onKeyDown={(event) => {
                // Arrows move to the next value the slider can show; Page keys jump round numbers.
                const fine = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
                const coarse = event.key === "PageUp" ? 1 : event.key === "PageDown" ? -1 : 0;
                if (!fine && !coarse) return;
                event.preventDefault();
                if (coarse) {
                  choose(step(value, coarse as 1 | -1));
                  return;
                }
                let at = toSlider(value);
                let next = value;
                while (next === value && at > 0 && at < STEPS) {
                  at += fine;
                  next = fromSlider(at);
                }
                choose(next);
              }}
            />
            <button type="button" className="slider__nudge" aria-label={t("bigger")} onClick={() => choose(step(value, 1))}>
              +
            </button>
          </div>
          <div className="slider__scale" aria-hidden="true">
            <span>{ratio(RATIO_MIN)}</span>
            <span>1</span>
            <span>{ratio(RATIO_MAX)}</span>
          </div>
          <button type="submit" className="button button--primary round__go" disabled={pending}>
            {pending ? t("judging") : t("guess")}
          </button>
        </form>
      ) : landed ? (
        <Reveal result={result} last={last} onNext={onNext} />
      ) : (
        <div className="measuring" role="status">
          <span className="measuring__value">×{ratio(result.guess)}</span>
          <span className="measuring__text">{t("judging")}</span>
        </div>
      )}
    </section>
  );
}

function Reveal({ result, last, onNext }: { result: Result; last: boolean; onNext: () => void }): React.ReactElement {
  const { t, name, language } = useLocale();
  const ratio = useRatio();
  const area = useArea();
  const plural = new Intl.PluralRules(language).select(result.score);
  const pointsWord = plural === "one" ? t("pointsOne") : plural === "few" ? t("pointsFew") : t("points");
  const score = useCountUp(result.score, true);
  const nextRef = useRef<HTMLButtonElement>(null);
  // Ready for Enter, without yanking a phone's page away from the map.
  useEffect(() => nextRef.current?.focus({ preventScroll: true }), []);
  const factor = result.apparent / result.ratio;
  // The map stretches whichever country lies further from the equator; name that one.
  const stretched = factor >= 1 ? result.target : result.unit;
  const other = factor >= 1 ? result.unit : result.target;
  const note =
    Math.abs(Math.log(factor)) > Math.log(1.25)
      ? t("lieStretch", { far: name(stretched), near: name(other), n: ratio(Math.max(factor, 1 / factor)) })
      : t("lieFair");
  return (
    <div className={`reveal reveal--${band(result.score)}`}>
      {result.score >= 90 && <Confetti />}
      <div className="reveal__score">
        <strong>+{score}</strong>
        <span>{pointsWord}</span>
      </div>
      <dl className="reveal__facts">
        <div className="reveal__truth">
          <dt>{t("truth")}</dt>
          {/* "≈" when the shown value is rounded, so ×1/5 against ×1/5 scoring 99 makes sense. */}
          <dd>
            {Math.abs(nice(result.ratio) / result.ratio - 1) > 0.005 ? "≈" : ""}×{ratio(result.ratio)}
          </dd>
        </div>
        <div>
          <dt>{t("yours")}</dt>
          <dd>×{ratio(result.guess)}</dd>
        </div>
        <div className={`reveal__lie${Math.abs(Math.log(factor)) > Math.log(1.25) ? " is-lie" : ""}`}>
          <dt>{t("onTheMap")}</dt>
          <dd>×{ratio(result.apparent)}</dd>
        </div>
      </dl>
      {result.areas && (
        <p className="reveal__areas">
          {name(result.target)} {area(result.areas[0])} · {name(result.unit)} {area(result.areas[1])}
        </p>
      )}
      <p className="reveal__note">{note}</p>
      <button ref={nextRef} type="button" className="button button--primary round__go" onClick={onNext}>
        {last ? t("seeResult") : t("nextRound")}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
