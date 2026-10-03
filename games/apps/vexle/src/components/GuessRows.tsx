import { type Judged, MAX_GUESSES } from "@vexle/data/client";
import { useLocale } from "../i18n/index.tsx";
import { Arrow } from "./Compass.tsx";

/**
 * Six slots, one per guess. Each filled one carries the colour of its dot on
 * the compass, the distance, the way to go and how close it came.
 */
export function GuessRows({
  results,
  pending,
  compact = false,
}: {
  results: readonly Judged[];
  pending: boolean;
  /** Once the round is over the empty slots have nothing left to promise. */
  compact?: boolean;
}): React.ReactElement {
  const { t, name, number } = useLocale();

  return (
    <ol className="rows">
      {Array.from({ length: compact ? results.length : MAX_GUESSES }, (_, index) => {
        const result = results[index];
        const slot = index + 1;
        if (!result) {
          const waiting = pending && index === results.length;
          return (
            <li key={index} className={`row row--empty${waiting ? " is-waiting" : ""}`}>
              <span className="row__badge">{slot}</span>
              {waiting && <span className="row__dots" aria-hidden="true"><i /><i /><i /></span>}
            </li>
          );
        }
        const correct = result.bearing === null;
        return (
          <li key={result.code} className={`row row--filled dot--${slot}${correct ? " is-correct" : ""}`}>
            <span className="row__badge">{slot}</span>
            <span className="row__name">{name(result.code)}</span>
            {correct ? (
              <span className="row__found">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5 L10 17 L19 7.5" />
                </svg>
              </span>
            ) : (
              <>
                <span className="row__km">{t("km", { n: number(result.km) })}</span>
                <span className="row__dir" title={`${result.bearing}°`}>
                  <Arrow bearing={result.bearing!} />
                </span>
              </>
            )}
            <span className="row__near" aria-label={`${result.proximity}%`}>
              <span className="row__bar">
                <span style={{ width: `${result.proximity}%` }} />
              </span>
              <span className="row__pct">{result.proximity}%</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
