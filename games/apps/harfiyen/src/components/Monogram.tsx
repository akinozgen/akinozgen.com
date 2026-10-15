import { hueOf, initials } from "../game/names.ts";

/** A player's badge: two letters of their name on a colour of its own. Without a name, an empty seat. */
export function Monogram({ name, size = "md" }: { name: string | null; size?: "sm" | "md" | "lg" }): React.ReactElement {
  if (!name) {
    return (
      <span className={`monogram monogram--${size} monogram--empty`} aria-hidden="true">
        ?
      </span>
    );
  }
  return (
    <span className={`monogram monogram--${size}`} style={{ "--hue": hueOf(name) } as React.CSSProperties} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
