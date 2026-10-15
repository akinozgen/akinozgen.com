import type { Random } from "../rng.ts";

/**
 * Room codes: six characters from an alphabet without the ones people mix
 * up (0/O, 1/I/L, U/V), so a code read out or typed by hand still works:
 * 30⁶ ≈ 729 million of them.
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

export function newCode(random: Random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/**
 * A code as typed: ASCII letters upper-cased by table, never by locale (a
 * Turkish keyboard's "i" must not become "İ"); null if it can't be a code.
 */
export function normalizeCode(text: string): string | null {
  const code = text.trim().replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32));
  return CODE_PATTERN.test(code) ? code : null;
}
