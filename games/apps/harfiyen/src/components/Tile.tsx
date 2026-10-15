import { LETTERS, upper } from "@harfiyen/engine";

/** One tile: the letter, and its points in the corner. A joker shows its letter, worth nothing. */
export function Tile({
  letter,
  joker,
  value,
  className = "",
  style,
}: {
  /** Letter index; -1 for a joker not yet named. */
  letter: number;
  joker: boolean;
  value: number;
  className?: string;
  style?: React.CSSProperties;
}): React.ReactElement {
  const named = letter >= 0;
  return (
    <span className={`tile${joker ? " tile--joker" : ""}${className ? ` ${className}` : ""}`} style={style}>
      <span className="tile__letter">{named ? upper(LETTERS[letter]) : "?"}</span>
      {!joker && <span className="tile__value">{value}</span>}
    </span>
  );
}

/** How a tile reads aloud. */
export function tileName(letter: number, joker: boolean, value: number): string {
  if (joker) return letter >= 0 ? `Joker, ${upper(LETTERS[letter])} olarak` : "Joker";
  return `${upper(LETTERS[letter])}, ${value} puan`;
}
