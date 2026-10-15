import { LETTERS, type Table, TILE_SET, unseenTiles, upper } from "@harfiyen/engine";

/** Tiles not yet seen from your seat — the bag and the other rack together — letter by letter. */
export function BagView({ game, compact = false }: { game: Table; compact?: boolean }): React.ReactElement {
  const unseen = unseenTiles(game, TILE_SET);
  const total = unseen.reduce((a, b) => a + b, 0);
  const all = TILE_SET.counts.reduce((a, b) => a + b, 0) + TILE_SET.jokers;
  return (
    <div className={`bag${compact ? " bag--compact" : ""}`}>
      <div className="bag__meter" aria-hidden="true">
        <span style={{ width: `${(game.bagCount / all) * 100}%` }} />
      </div>
      <p className="bag__sum">
        <strong>{game.bagCount}</strong> taş torbada · görmediğin <strong>{total}</strong> taş
        <span className="muted"> (torba + rakibin eli)</span>
      </p>
      <ul className="unseen" aria-label="Görmediğin harfler">
        {[...LETTERS.map((letter, i) => ({ text: upper(letter), left: unseen[i], of: TILE_SET.counts[i]})), { text: "?", left: unseen[LETTERS.length], of: TILE_SET.jokers }].map(
          (entry) => (
            <li
              key={entry.text}
              className={`unseen__one${entry.left === 0 ? " is-gone" : ""}`}
              aria-label={`${entry.text === "?" ? "Joker" : entry.text}: ${entry.left} / ${entry.of}`}
            >
              <span className="unseen__letter">{entry.text}</span>
              <span className="unseen__count">{entry.left}</span>
              <span className="unseen__bar" aria-hidden="true">
                <i style={{ width: `${(entry.left / entry.of) * 100}%` }} />
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
