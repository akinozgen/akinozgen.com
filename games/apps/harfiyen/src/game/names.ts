import { NAME_WORDS } from "@harfiyen/engine/name-words";

/**
 * Players' names as the screens show them. A name is the account's
 * (games/packages/account): two words the player may change and a number
 * that stays — "Neşeli Kirpi #4821".
 */

/** A name in its parts: "Neşeli Kirpi #4821" → "Neşeli Kirpi" and "4821". */
export function splitName(name: string): { base: string; number: string } {
  const at = name.lastIndexOf(" #");
  return at === -1 ? { base: name, number: "" } : { base: name.slice(0, at), number: name.slice(at + 2) };
}

const BY_LENGTH = [...NAME_WORDS.adjectives].sort((a, b) => b.length - a.length);

/** A name's badge letters: the adjective's and the animal's for a default name, else the first two words' (or one). */
export function initials(name: string): string {
  const { base } = splitName(name);
  const adjective = BY_LENGTH.find((word) => base.startsWith(`${word} `));
  const rest = adjective ? base.slice(adjective.length + 1) : base.split(/\s+/).slice(1).join(" ");
  return `${[...base][0] ?? "?"}${[...rest][0] ?? ""}`.toLocaleUpperCase("tr");
}

/**
 * A colour for a name, the same on every screen: from the account's number,
 * so it survives a new name — and matches the account's own badge.
 */
export function hueOf(name: string): number {
  const { number } = splitName(name);
  const key = number || name;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}
