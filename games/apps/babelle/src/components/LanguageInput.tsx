import { useId, useMemo, useRef, useState } from "react";
import { fold, LANGUAGES } from "../game/data.ts";
import { useLocale } from "../i18n/index.tsx";

const MAX_SUGGESTIONS = 6;

interface Entry {
  id: string;
  name: string;
  keys: string[];
}

/** Type a language's name in any interface language; pick from the list. */
export function LanguageInput({
  taken,
  disabled,
  onGuess,
}: {
  taken: readonly string[];
  disabled: boolean;
  /** "busy" leaves the box as it is, to try again once the last guess lands. */
  onGuess: (id: string) => string;
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
      LANGUAGES.map((l) => ({
        id: l.id,
        name: l.names[language],
        keys: [...new Set(Object.values(l.names).map(fold))],
      })).sort((a, b) => a.name.localeCompare(b.name, language)),
    [language],
  );

  const suggestions = useMemo(() => {
    const needle = fold(query);
    if (!needle) return [];
    const exact: Entry[] = [];
    const starts: Entry[] = [];
    const contains: Entry[] = [];
    for (const entry of entries) {
      if (taken.includes(entry.id)) continue;
      if (entry.keys.includes(needle)) exact.push(entry);
      else if (entry.keys.some((k) => k.startsWith(needle) || k.split(" ").some((w) => w.startsWith(needle)))) starts.push(entry);
      else if (entry.keys.some((k) => k.includes(needle))) contains.push(entry);
    }
    return [...exact, ...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [query, entries, taken]);

  const pick = (entry: Entry | undefined): void => {
    if (!entry) {
      setHint(query.trim() ? t("pickFromList") : null);
      return;
    }
    if (taken.includes(entry.id)) {
      setHint(t("alreadyGuessed", { language: entry.name }));
      return;
    }
    if (onGuess(entry.id) === "busy") return;
    setQuery("");
    setActive(0);
    setHint(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const submit = (): void => {
    const needle = fold(query);
    const exact = entries.find((e) => e.keys.includes(needle));
    if (exact && taken.includes(exact.id)) {
      setHint(t("alreadyGuessed", { language: name(exact.id) }));
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
            placeholder={t("placeholder")}
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
            <li key={entry.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
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
      {hint && <p className="guess-input__hint" role="alert">{hint}</p>}
    </div>
  );
}
