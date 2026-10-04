import { useId, useMemo, useRef, useState } from "react";
import { bestMatches } from "@travelle/core";
import { COUNTRIES, fold } from "../game/countries.ts";
import { useLocale } from "../i18n/index.tsx";

const MAX_SUGGESTIONS = 6;

interface Entry {
  code: string;
  name: string;
  /** The name in the language being played, folded: it ranks first. */
  own: string;
  /** Every language's name and alias, folded. */
  keys: string[];
}

/**
 * Type in any of the game's languages; pick from the list. A name typed out
 * in full is accepted without picking.
 */
export function GuessInput({
  taken,
  disabled,
  placeholder,
  onGuess,
}: {
  taken: readonly string[];
  disabled: boolean;
  /** Overrides the usual prompt, e.g. while the die waits to be rolled. */
  placeholder?: string;
  /** "busy" leaves the box as it is, to try again once the last guess lands. */
  onGuess: (code: string) => string;
}): React.ReactElement {
  const { t, name, language } = useLocale();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const entries = useMemo<Entry[]>(
    () =>
      COUNTRIES.map((country) => ({
        code: country.code,
        name: country.names[language],
        own: fold(country.names[language]),
        keys: [...new Set([...Object.values(country.names), ...country.aliases].map(fold))],
      })).sort((a, b) => a.name.localeCompare(b.name, language)),
    [language],
  );

  const suggestions = useMemo(() => {
    const open = entries.filter((entry) => !taken.includes(entry.code));
    return bestMatches(
      open,
      fold(query),
      (entry) => ({ own: entry.own, others: entry.keys, label: entry.name }),
      MAX_SUGGESTIONS,
      language,
    );
  }, [query, entries, taken, language]);

  const pick = (entry: Entry | undefined): void => {
    if (!entry) {
      setHint(query.trim() ? t("pickFromList") : null);
      return;
    }
    if (taken.includes(entry.code)) {
      setHint(t("alreadyGuessed", { country: entry.name }));
      return;
    }
    if (onGuess(entry.code) === "busy") return;
    setQuery("");
    setActive(0);
    setHint(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const submit = (): void => {
    const needle = fold(query);
    const exact = entries.find((entry) => entry.keys.includes(needle));
    if (exact && taken.includes(exact.code)) {
      setHint(t("alreadyGuessed", { country: name(exact.code) }));
      return;
    }
    pick(exact ?? suggestions[active]);
  };

  const showList = open && suggestions.length > 0 && !disabled;

  return (
    <div className="guess-input">
      <form
        className="guess-input__row"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="guess-input__field">
          <svg viewBox="0 0 24 24" className="guess-input__icon" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16 L20.5 20.5" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="guess-input__text"
            placeholder={placeholder ?? t("placeholder")}
            aria-label={t("guessLabel")}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            readOnly={disabled}
            aria-busy={disabled}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setOpen(true);
              setHint(null);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, suggestions.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>
        <button type="submit" className="button button--primary guess-input__go" disabled={disabled || !query.trim()}>
          {t("guess")}
        </button>
      </form>

      {showList && (
        <ul className="guess-input__list" id={listId} role="listbox">
          {suggestions.map((entry, index) => (
            <li key={entry.code} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`guess-input__option${index === active ? " is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(entry)}
              >
                {entry.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="guess-input__hint">{hint}</p>}
    </div>
  );
}
