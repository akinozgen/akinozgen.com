import type { User } from "../protocol.ts";

/** The account's colour, from its number, so a new name keeps it: the same hash harfiyen colours a player's badge with. */
export function hueOf(tag: string): number {
  let h = 2166136261;
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}

/** The first letter of the name's words. */
export const initialOf = (user: User): string => ([...user.base.trim()][0] ?? "?").toLocaleUpperCase("tr");

/** A round badge: the name's first letter on the account's own colour. */
export function Avatar({ user, size = "sm" }: { user: User; size?: "sm" | "lg" }): React.ReactElement {
  return (
    <span
      className={`account-avatar account-avatar--${size}`}
      style={{ "--account-hue": hueOf(user.tag) } as React.CSSProperties}
      aria-hidden="true"
    >
      {initialOf(user)}
    </span>
  );
}

export function PersonIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 19.6c1-3.4 3.8-5.6 7.2-5.6s6.2 2.2 7.2 5.6" />
    </svg>
  );
}
