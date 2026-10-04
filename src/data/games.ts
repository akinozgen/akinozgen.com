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
    slug: "babelle",
    name: "babelle",
    tagline: "name the language",
    description:
      "A daily language game. Five picture cards in a hidden language — match the words, spot it among its neighbours, find its relatives — then name it in three tries.",
    year: "2026",
    tags: ["daily", "languages", "five languages"],
  },
  {
    slug: "vexle",
    name: "vexle",
    tagline: "name the flag",
    description:
      "A daily flag game. Each guess turns over one tile of the flag, and a compass points from your last guess towards the answer — how far, which way, how close.",
    year: "2026",
    tags: ["daily", "flags", "five languages"],
  },
  {
    slug: "travelle",
    name: "travelle",
    tagline: "walk the borders",
    description:
      "A daily geography game. Two countries, and you name the ones that link them by land — every border on a globe built from Natural Earth, exclaves, bridges and all.",
    year: "2026",
    tags: ["daily", "geography", "five languages"],
  },
  {
    slug: "belediye",
    name: "Çaylar Belediyeden",
    tagline: "tea's on the town hall",
    description:
      "You're the mayor of Karakavak, a made-up Anatolian town. Swipe each memo left or right and keep the people, the treasury, the shopkeepers and Ankara on side — with an election every five years.",
    year: "2026",
    tags: ["card game", "in Turkish", "works offline"],
  },
];
