export interface Game {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  year: string;
  tags: string[];
}

/** Everything under /games. The sources live in this repo under games/. */
export const games: Game[] = [
  {
    slug: "travelle",
    name: "travelle",
    tagline: "walk the borders",
    description:
      "A daily geography game. Two countries, and you name the ones that link them by land — every border on a globe built from Natural Earth, exclaves, bridges and all.",
    year: "2026",
    tags: ["daily", "geography", "five languages"],
  },
];
