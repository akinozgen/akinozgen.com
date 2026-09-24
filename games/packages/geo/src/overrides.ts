/**
 * Hand-curated exceptions. Everything else is derived from Natural Earth geometry.
 * Mirrors the ruleset Travle documents on its /extra_info page.
 */

/**
 * Countries Natural Earth keeps whole but that the game splits into separate
 * regions. Every subunit of a split country must be listed: the build refuses
 * to run otherwise, so a change of source data cannot quietly lose land.
 */
export interface SplitRule {
  /** ADMIN value in ne_*_admin_0_countries. */
  admin: string;
  /** SU_A3 -> region name. Several subunits may map to the same name to merge them. */
  subunits: Record<string, string>;
}

export const SPLIT_REGIONS: SplitRule[] = [
  {
    admin: "France",
    subunits: {
      FXX: "France",
      FXC: "France", // Corsica stays part of France
      MYT: "Mayotte",
      REU: "Réunion",
      MTQ: "Martinique",
      GLP: "Guadeloupe",
      GUF: "French Guiana", // the one that matters: it borders Brazil and Suriname
    },
  },
  {
    admin: "Norway",
    subunits: { NOW: "Norway", NJM: "Jan Mayen", NSV: "Svalbard", BVT: "Bouvet Island" },
  },
  {
    admin: "Portugal",
    subunits: { PRX: "Portugal", PMD: "Madeira", PAZ: "Azores" },
  },
  {
    admin: "Netherlands",
    subunits: { NLX: "Netherlands", NLY: "Caribbean Netherlands" },
  },
  {
    admin: "New Zealand",
    subunits: {
      NZN: "New Zealand",
      NZS: "New Zealand",
      NZA: "New Zealand",
      NZC: "New Zealand",
      NZK: "New Zealand",
      TKL: "Tokelau",
    },
  },
];

/**
 * Names Natural Earth gets wrong for a game. Its Turkish for Taiwan is "Çin
 * Cumhuriyeti", the formal Republic of China — which sits in an autocomplete
 * next to "Çin" and helps nobody find Tayvan.
 */
export const NAME_OVERRIDES: Record<string, Partial<Record<string, string>>> = {
  taiwan: { tr: "Tayvan" },
  "macao-s-a-r": { en: "Macau", tr: "Makao", de: "Macau", es: "Macao", fr: "Macao" },
  "hong-kong-s-a-r": { en: "Hong Kong" },
};

/**
 * Slivers the 10m source carries that no one should have to guess: leased
 * enclaves, sovereign base areas, buffer zones and unclaimed ground. Each is
 * folded into the country around it rather than dropped, so the land — and
 * the borders across it — stay on the map.
 *
 * Where the ground is genuinely unclaimed or disputed, the host named here is
 * a game decision, not a position: the pieces are small and every one of them
 * has a neighbour it cannot change the route through.
 */
export const MERGE_REGIONS: Record<string, string> = {
  "Akrotiri Sovereign Base Area": "Cyprus",
  "Dhekelia Sovereign Base Area": "Cyprus",
  "Cyprus No Mans Area": "Cyprus",
  "Baykonur Cosmodrome": "Kazakhstan",
  "US Naval Base Guantanamo Bay": "Cuba",
  "Bir Tawil": "Sudan",
  "Brazilian Island": "Brazil",
  "Southern Patagonian Ice Field": "Chile",
};

/**
 * Fixed links that geometry alone cannot produce. Each end is given as the
 * bridgehead's own landfall rather than a midpoint, because a midpoint can sit
 * nearer some unrelated islet than the landmass it is meant to join. The build
 * resolves each end to its nearest area and fails if that area's region is not
 * the one named, so refreshing the source data cannot silently reroute a bridge.
 */
export interface BridgeEnd {
  region: string;
  at: [number, number];
}

export interface BridgeRule {
  note: string;
  from: BridgeEnd;
  to: BridgeEnd;
}

export const BRIDGES: BridgeRule[] = [
  {
    note: "Channel Tunnel",
    from: { region: "United Kingdom", at: [0.95, 51.15] }, // Kent, behind Folkestone
    to: { region: "France", at: [2.05, 50.87] }, // Pas-de-Calais, behind Coquelles
  },
  {
    note: "Øresund Bridge and Drogden Tunnel",
    from: { region: "Denmark", at: [12.4, 55.72] }, // Zealand, behind Copenhagen
    to: { region: "Sweden", at: [13.1, 55.62] }, // behind Malmö
  },
  {
    note: "Great Belt Bridge",
    from: { region: "Denmark", at: [10.39, 55.4] }, // Odense, on Funen
    to: { region: "Denmark", at: [11.79, 55.44] }, // Ringsted, on Zealand
  },
  {
    note: "Little Belt Bridge",
    from: { region: "Denmark", at: [10.39, 55.4] }, // Odense, on Funen
    to: { region: "Denmark", at: [9.49, 55.49] }, // Kolding, in Jutland
  },
  {
    note: "Bridges over the Bosphorus",
    from: { region: "Turkey", at: [28.8, 41.05] }, // Istanbul, European side
    to: { region: "Turkey", at: [29.25, 40.95] }, // Istanbul, Asian side
  },
  {
    note: "Pelješac Bridge",
    from: { region: "Croatia", at: [17.43, 43.05] }, // Ploče, north of the Neum corridor
    to: { region: "Croatia", at: [18.09, 42.65] }, // Dubrovnik, on the southern exclave
  },
  {
    note: "Shared ownership of Hans Island",
    from: { region: "Greenland", at: [-55.0, 80.5] },
    to: { region: "Canada", at: [-75.0, 80.0] }, // Ellesmere Island
  },

  // Not in Travle's published table, but they are fixed road links and leaving
  // them out strands two otherwise playable countries. Drop these two entries
  // to fall back to Travle's exact connection set.
  {
    note: "Johor–Singapore Causeway",
    from: { region: "Singapore", at: [103.82, 1.35] },
    to: { region: "Malaysia", at: [103.7, 1.55] }, // Johor Bahru
  },
  {
    // Natural Earth's 10m outlines leave no shared vertex at the Portas do
    // Cerco, though the border and the 2018 sea bridge are both real.
    note: "Macau's border with Zhuhai, and the Hong Kong–Zhuhai–Macau Bridge",
    from: { region: "Macao S.A.R", at: [113.55, 22.17] },
    to: { region: "China", at: [113.57, 22.27] }, // Zhuhai
  },
  {
    note: "King Fahd Causeway",
    from: { region: "Bahrain", at: [50.55, 26.1] }, // Manama
    to: { region: "Saudi Arabia", at: [50.05, 26.35] }, // Al Khobar
  },
];

/**
 * Island hopping needs no list. A region's detached landmasses may be joined
 * only when nothing else already links them, and that single condition
 * reproduces Travle's whole exception table:
 *
 *   allowed   Indonesia's islands, Malaysia's two halves, Northern Ireland to
 *             Great Britain, Canada's Arctic islands (which is what makes the
 *             Hans Island link to Greenland useful)
 *   refused   Kaliningrad (reachable via Poland and Lithuania), Nakhchivan
 *             (via Armenia and Iran), Cabinda (via the DR Congo), Ceuta and
 *             Melilla (via Morocco), Gaza and the West Bank (via Israel)
 *
 * Hops are considered shortest-gap-first, so a long jump is skipped whenever
 * shorter ones have already opened a route.
 */

/** Regions never used as a puzzle start or end (unreachable or unfair). */
export const NON_PUZZLE_REGIONS = ["Antarctica", "Siachen Glacier"];
