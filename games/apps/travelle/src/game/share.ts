import { MARK_EMOJI, type GuessResult } from "@travelle/geo";
import type { Puzzle } from "./puzzle.ts";
import type { Status } from "./useGame.ts";

export function shareText(
  puzzle: Puzzle,
  title: string,
  results: readonly GuessResult[],
  status: Status,
  aside: readonly string[],
): string {
  const score = status === "won" ? `${results.length}/${puzzle.budget}` : `X/${puzzle.budget}`;
  const marks = results.map((r) => MARK_EMOJI[r.mark]).join("");
  const suffix = aside.length > 0 ? ` (${aside.join(", ")})` : "";
  return [`travelle ${title} ${score}${suffix}`, marks].filter(Boolean).join("\n");
}

/** Copies to the clipboard, falling back to a hidden textarea on older browsers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}
