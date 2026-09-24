import { useMemo, useRef, useState } from "react";
import { graph } from "../game/puzzle.ts";
import { useLocale } from "../i18n/index.tsx";

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .trim();

interface Entry {
  id: string;
  name: string;
  /** Every language's name, folded, so any spelling finds the country. */
  keys: string[];
}

const MAX_SUGGESTIONS = 6;

export function SearchBar({
  disabled,
  allowed,
  taken,
  onGuess,
}: {
  disabled: boolean;
  /** Countries on the map for this round — the endless mode narrows this. */
  allowed: readonly string[];
  taken: readonly string[];
  onGuess: (regionId: string) => void;
}): React.ReactElement {
  const { t, name } = useLocale();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const onMap = new Set(allowed);
    return graph.regions
      .filter((region) => onMap.has(region.id))
      .map((region) => ({
        id: region.id,
        name: name(region.id),
        keys: [...new Set(Object.values(region.names).map(fold))],
      }));
  }, [allowed, name]);

  const suggestions = useMemo(() => {
    const needle = fold(query);
    if (needle.length === 0) return [];
    const starts: Entry[] = [];
    const contains: Entry[] = [];
    for (const entry of entries) {
      if (taken.includes(entry.id)) continue;
      if (entry.keys.some((key) => key.startsWith(needle))) starts.push(entry);
      else if (entry.keys.some((key) => key.includes(needle))) contains.push(entry);
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [query, entries, taken]);

  const submit = (entry: Entry | undefined): void => {
    if (!entry) return;
    onGuess(entry.id);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  };

  return (
    <div className="search">
      <input
        ref={inputRef}
        type="text"
        className="search__input"
        placeholder={disabled ? t("roundOver") : t("guessPlaceholder")}
        value={query}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={t("guessLabel")}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            submit(suggestions[active]);
          } else if (event.key === "Escape") {
            setQuery("");
          }
        }}
      />
      {suggestions.length > 0 && (
        <ul className="search__list">
          {suggestions.map((entry, index) => (
            <li key={entry.id}>
              <button
                type="button"
                className={`search__option${index === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => submit(entry)}
              >
                {entry.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
