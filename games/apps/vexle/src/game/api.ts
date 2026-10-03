import type { DailyInfo, VexleVerdict } from "@vexle/data/client";

/** The game server. It alone knows today's flag. */
const BASE = `${import.meta.env.VITE_VEXLE_API ?? "/api/vexle"}`;

async function get<T>(action: string, params: Record<string, string | undefined>): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const response = await fetch(`${BASE}/${action}?${query}`);
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  return (await response.json()) as T;
}

export function fetchDaily(date: string): Promise<DailyInfo> {
  return get("daily", { date });
}

export function judge(date: string, guesses: readonly string[], hard: boolean): Promise<VexleVerdict> {
  return get("judge", { d: date, g: guesses.join(","), hard: hard ? "1" : undefined });
}
