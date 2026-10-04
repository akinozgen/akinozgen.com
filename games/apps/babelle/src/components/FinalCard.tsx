import { FINAL_TRIES, type FinalGuess, type Status } from "@babelle/data/client";
import { useLocale } from "../i18n/index.tsx";
import { type Bearing, Compass } from "./Compass.tsx";
import { LanguageInput } from "./LanguageInput.tsx";

const FURTHEST_KM = 20_000;

export function toBearing(guess: FinalGuess): Bearing {
  return {
    key: guess.id,
    km: guess.km,
    bearing: guess.bearing,
    proximity: guess.km === 0 ? 100 : Math.min(99, Math.floor((Math.max(FURTHEST_KM - guess.km, 0) / FURTHEST_KM) * 100)),
  };
}

/** A small arrow for a guess row, turned to the bearing. */
function Arrow({ bearing }: { bearing: number }): React.ReactElement {
  return (
    <svg viewBox="-12 -12 24 24" className="arrow" style={{ transform: `rotate(${bearing}deg)` }} aria-hidden="true">
      <path d="M0 -9 L6 3 L0 0 L-6 3 Z" />
    </svg>
  );
}

export function GuessRows({
  guesses,
  pending,
  compact = false,
}: {
  guesses: readonly FinalGuess[];
  pending: boolean;
  /** Once the day is over the empty slots have nothing left to promise. */
  compact?: boolean;
}): React.ReactElement {
  const { t, name, number } = useLocale();
  return (
    <ol className="rows">
      {Array.from({ length: compact ? guesses.length : FINAL_TRIES }, (_, i) => {
        const guess = guesses[i];
        const slot = i + 1;
        if (!guess) {
          return (
            <li key={i} className={`row row--empty${pending && i === guesses.length ? " is-waiting" : ""}`}>
              <span className="row__badge">{slot}</span>
              {pending && i === guesses.length && (
                <span className="row__dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </li>
          );
        }
        const found = guess.km === 0;
        const b = toBearing(guess);
        return (
          <li key={guess.id} className={`row row--filled dot--${slot}${found ? " is-correct" : ""}`}>
            <span className="row__badge">{slot}</span>
            <span className="row__name" title={name(guess.id)}>
              {name(guess.id)}
              {!found && (
                <span className={`row__family${guess.sameFamily ? " is-same" : ""}`}>
                  {guess.sameFamily ? t("sameFamily") : t("otherFamily")}
                </span>
              )}
            </span>
            {found ? (
              <span className="row__found">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5 L10 17 L19 7.5" />
                </svg>
              </span>
            ) : (
              <>
                <span className="row__km">{t("km", { n: number(guess.km) })}</span>
                <span className="row__dir">
                  <Arrow bearing={guess.bearing ?? 0} />
                </span>
              </>
            )}
            <span className="row__near">
              <span className="row__bar">
                <span style={{ width: `${b.proximity}%` }} />
              </span>
              <span className="row__pct">{b.proximity}%</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Naming the language: three tries, a compass to steer by. */
export function FinalCard({
  guesses,
  status,
  pending,
  onGuess,
}: {
  guesses: readonly FinalGuess[];
  status: Status;
  pending: boolean;
  onGuess: (id: string) => string;
}): React.ReactElement {
  const { t } = useLocale();
  return (
    <section className="final">
      <Compass results={guesses.map(toBearing)} status={status} className="final__compass" />
      <h2 className="final__title">{t("finalTitle")}</h2>
      <p className="final__hint">{t("finalHint")}</p>
      {status === "playing" && (
        <>
          <p className="final__left">{t("triesLeft", { n: FINAL_TRIES - guesses.length, total: FINAL_TRIES })}</p>
          <LanguageInput taken={guesses.map((g) => g.id)} disabled={pending} onGuess={onGuess} />
        </>
      )}
      <GuessRows guesses={guesses} pending={pending} />
    </section>
  );
}
