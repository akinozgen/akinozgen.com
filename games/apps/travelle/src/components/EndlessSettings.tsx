import { useMemo, useState } from "react";
import { CONTINENTS, type Endless } from "../game/endless.ts";
import { graph } from "../game/puzzle.ts";
import { useLocale } from "../i18n/index.tsx";
import type { StringKey } from "../i18n/strings.ts";
import { Sheet } from "./Sheet.tsx";

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .trim();

/** Countries per continent, counted once so the toggles can show the damage. */
const COUNTS = new Map<string, number>(
  CONTINENTS.map((continent) => [
    continent,
    graph.playableRegions().filter((r) => r.continent === continent).length,
  ]),
);

function ExcludePicker({
  excluded,
  onAdd,
}: {
  excluded: readonly string[];
  onAdd: (id: string) => void;
}): React.ReactElement {
  const { t, name } = useLocale();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = fold(query);
    if (needle.length === 0) return [];
    return graph
      .playableRegions()
      .filter(
        (region) =>
          !excluded.includes(region.id) &&
          Object.values(region.names).some((n) => fold(n).includes(needle)),
      )
      .slice(0, 5);
  }, [query, excluded]);

  return (
    <div className="search">
      <input
        id="exclude-country"
        type="text"
        className="search__input"
        placeholder={t("leaveOutPlaceholder")}
        value={query}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length > 0 && (
        <ul className="search__list">
          {matches.map((region) => (
            <li key={region.id}>
              <button
                type="button"
                className="search__option"
                onClick={() => {
                  onAdd(region.id);
                  setQuery("");
                }}
              >
                {t("removeCountry", { country: name(region.id) })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EndlessSettings({
  endless,
  onClose,
}: {
  endless: Endless;
  onClose: () => void;
}): React.ReactElement {
  const { settings, update, reset, inPlay, longest } = endless;
  const { t, name } = useLocale();
  // The list stretches to cover whatever is currently selected, so narrowing
  // the map never leaves a select showing a value it can no longer offer.
  const lengths = useMemo(() => {
    const top = Math.max(3, longest, settings.minLength, settings.maxLength);
    return Array.from({ length: top - 2 }, (_, i) => i + 3);
  }, [longest, settings.minLength, settings.maxLength]);

  const toggleContinent = (continent: string): void => {
    const next = settings.continents.includes(continent)
      ? settings.continents.filter((c) => c !== continent)
      : [...settings.continents, continent];
    // Switching the last one off would leave nothing to play with.
    if (next.length > 0) update({ continents: next });
  };

  return (
    <Sheet
      title={t("mapSetup")}
      onClose={onClose}
      footer={
        <>
          <p className="setup__count">{t("inPlay", { n: inPlay, longest })}</p>
          <div className="setup__actions">
            <button type="button" className="button button--quiet" onClick={reset}>
              {t("reset")}
            </button>
            <button type="button" className="button button--primary" onClick={onClose}>
              {t("done")}
            </button>
          </div>
        </>
      }
    >
      <div className="setup__section">
        <div className="setup__head">
          <h3 className="setup__title">{t("continents")}</h3>
          <p className="setup__aside">{t("continentsHint")}</p>
        </div>
        <div className="toggles">
          {CONTINENTS.map((continent) => {
            const on = settings.continents.includes(continent);
            return (
              <button
                key={continent}
                type="button"
                className={`toggle${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleContinent(continent)}
              >
                <span className="toggle__tick" aria-hidden="true">
                  {on ? "✓" : "+"}
                </span>
                {t(continent as StringKey)}
                <span className="toggle__count">{COUNTS.get(continent) ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="setup__section">
        <div className="setup__head">
          <h3 className="setup__title">{t("routeLength")}</h3>
          <p className="setup__aside">{t("routeLengthHint")}</p>
        </div>
        <div className="range">
          <label className="range__field">
            <span>{t("rangeFrom")}</span>
            <select
              value={settings.minLength}
              onChange={(event) => update({ minLength: Number(event.target.value) })}
            >
              {lengths.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="range__field">
            <span>{t("rangeTo")}</span>
            <select
              value={settings.maxLength}
              onChange={(event) => update({ maxLength: Number(event.target.value) })}
            >
              {lengths.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="range__unit">{t("guessesUnit")}</span>
        </div>
      </div>

      <div className="setup__section">
        <div className="setup__head">
          <h3 className="setup__title">
            <label htmlFor="exclude-country">{t("leaveOut")}</label>
          </h3>
          <p className="setup__aside">{t("leaveOutHint")}</p>
        </div>
        <ExcludePicker
          excluded={settings.excluded}
          onAdd={(id) => update({ excluded: [...settings.excluded, id] })}
        />
        {settings.excluded.length > 0 && (
          <div className="toggles toggles--removed">
            {settings.excluded.map((id) => (
              <button
                key={id}
                type="button"
                className="toggle is-removed"
                onClick={() => update({ excluded: settings.excluded.filter((x) => x !== id) })}
              >
                {name(id)}
                <span className="toggle__count" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

    </Sheet>
  );
}
