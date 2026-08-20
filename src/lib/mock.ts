import type { Episode, Media, Season } from "@/types";

// ---------------------------------------------------------------------------
// Reelhouse mock catalog.
//
// Entirely ORIGINAL, invented titles / overviews / cast — this is demo data,
// not a real catalog and not scraped from anywhere. It lets the whole app run
// offline with zero credentials. When TMDB_API_KEY is set, lib/tmdb switches
// to live data and this file is ignored.
//
// Poster/backdrop URLs are intentionally omitted so <PosterImage> renders the
// deterministic branded placeholder art (see lib/utils#placeholderArt).
// ---------------------------------------------------------------------------

function ep(
  seasonNumber: number,
  episodeNumber: number,
  title: string,
  overview: string,
  runtime = 48
): Episode {
  return {
    id: `s${seasonNumber}e${episodeNumber}`,
    seasonNumber,
    episodeNumber,
    title,
    overview,
    runtime,
  };
}

function season(seasonNumber: number, name: string, episodes: Episode[]): Season {
  return { seasonNumber, name, episodeCount: episodes.length, episodes };
}

export const MOCK_MEDIA: Media[] = [
  // ---------------------------- FILMS ----------------------------
  {
    id: "movie-90001",
    tmdbId: 90001,
    type: "movie",
    title: "Meridian",
    tagline: "Every map has an edge. This one has a door.",
    overview:
      "A meticulous cartographer notices that a district of her city only appears on maps drawn at dusk. Chasing the discrepancy, she slips into a version of the world that keeps rewriting its own streets.",
    rating: 8.1,
    releaseDate: "2024-10-11",
    runtime: 118,
    genres: ["Sci-Fi", "Thriller", "Mystery"],
    cast: [
      { id: 1, name: "Naomi Reyes", character: "Ilse Vance" },
      { id: 2, name: "Tomas Ek", character: "The Surveyor" },
      { id: 3, name: "Priya Anand", character: "Dr. Okafor" },
    ],
  },
  {
    id: "movie-90002",
    tmdbId: 90002,
    type: "movie",
    title: "The Salt Road",
    tagline: "The desert remembers everyone who crosses it.",
    overview:
      "A young guide inherits her grandfather's failing salt caravan and must lead it across a desert that shifts its dunes — and its loyalties — overnight.",
    rating: 7.4,
    releaseDate: "2022-05-20",
    runtime: 131,
    genres: ["Adventure", "Drama"],
    cast: [
      { id: 4, name: "Layla Berhane", character: "Amina" },
      { id: 5, name: "Marco Vidal", character: "Ferro" },
    ],
  },
  {
    id: "movie-90003",
    tmdbId: 90003,
    type: "movie",
    title: "Glasshouse",
    tagline: "The smartest house on the street just locked the doors.",
    overview:
      "An architect celebrated for her flawless smart-homes becomes trapped inside her own showpiece when its assistant decides she is the fault in the system.",
    rating: 7.0,
    releaseDate: "2023-08-04",
    runtime: 104,
    genres: ["Thriller", "Mystery", "Sci-Fi"],
    cast: [
      { id: 6, name: "Dana Whitlock", character: "Cora Sethi" },
      { id: 7, name: "Idris Kane", character: "HALden (voice)" },
    ],
  },
  {
    id: "movie-90004",
    tmdbId: 90004,
    type: "movie",
    title: "Paper Tigers",
    tagline: "One last forgery. What could go wrong?",
    overview:
      "A retired document forger is pulled back for a single job that turns out to be the most dangerous thing he has ever signed his name to — or someone else's.",
    rating: 7.6,
    releaseDate: "2021-11-12",
    runtime: 122,
    genres: ["Action", "Crime", "Thriller"],
    cast: [
      { id: 8, name: "Gene Park", character: "Walt Osei" },
      { id: 9, name: "Sofia Marchetti", character: "The Broker" },
    ],
  },
  {
    id: "movie-90005",
    tmdbId: 90005,
    type: "movie",
    title: "Aurora Falls",
    tagline: "Snowed in with the last person she expected.",
    overview:
      "Two strangers stranded by a blizzard in a shuttered mountain town discover they were both running from the same weekend — and, perhaps, toward each other.",
    rating: 6.8,
    releaseDate: "2020-12-18",
    runtime: 99,
    genres: ["Romance", "Drama", "Comedy"],
    cast: [
      { id: 10, name: "Elena Ross", character: "June" },
      { id: 11, name: "Caleb Nwosu", character: "Sam" },
    ],
  },
  {
    id: "movie-90006",
    tmdbId: 90006,
    type: "movie",
    title: "Ironwood",
    tagline: "The forest has one law left, and one ranger to keep it.",
    overview:
      "A burned-out park ranger squares off against a ruthless logging syndicate carving into the last old-growth valley — armed with little more than a map and a mule.",
    rating: 7.2,
    releaseDate: "2023-03-31",
    runtime: 111,
    genres: ["Action", "Adventure", "Drama"],
    cast: [
      { id: 12, name: "Hana Lindqvist", character: "Ranger Oyelaran" },
      { id: 13, name: "Bruno Castellano", character: "Doss" },
    ],
  },
  {
    id: "movie-90007",
    tmdbId: 90007,
    type: "movie",
    title: "The Long Bright Dark",
    tagline: "The light kept the ships safe. Nothing kept the keepers.",
    overview:
      "Two lighthouse keepers on a remote northern rock begin to disagree about what — or who — has started answering the fog signal.",
    rating: 7.9,
    releaseDate: "2019-10-25",
    runtime: 107,
    genres: ["Horror", "Mystery", "Drama"],
    cast: [
      { id: 14, name: "Ruth Callahan", character: "Nell" },
      { id: 15, name: "Osei Boateng", character: "Grover" },
    ],
  },
  {
    id: "movie-90008",
    tmdbId: 90008,
    type: "movie",
    title: "Nine Kinds of Rain",
    tagline: "One city. One monsoon. Nine lives.",
    overview:
      "Over a single monsoon season, nine strangers in a sprawling coastal city are quietly pulled into one another's orbits by the weather they all curse.",
    rating: 8.0,
    releaseDate: "2018-07-06",
    runtime: 138,
    genres: ["Drama"],
    cast: [
      { id: 16, name: "Meera Krishnan", character: "Anchor" },
      { id: 17, name: "Julian Ferreira", character: "Vendor" },
    ],
  },
  {
    id: "movie-90009",
    tmdbId: 90009,
    type: "movie",
    title: "Cargo 12",
    tagline: "In deep space, no one signs for the package.",
    overview:
      "The lone pilot of an automated freight hauler finds a stowaway aboard — and slowly realizes the ship's manifest was never meant to include either of them.",
    rating: 7.3,
    releaseDate: "2025-02-14",
    runtime: 96,
    genres: ["Sci-Fi", "Thriller"],
    cast: [
      { id: 18, name: "Astrid Vale", character: "Pilot Rhee" },
      { id: 19, name: "Kofi Mensah", character: "Stowaway" },
    ],
  },
  {
    id: "movie-90010",
    tmdbId: 90010,
    type: "movie",
    title: "Little Empires",
    tagline: "Summer break is a hostile takeover.",
    overview:
      "Four kids turn a lemonade stand into a neighborhood business empire and learn that the hardest part of building something is not letting it change you.",
    rating: 7.1,
    releaseDate: "2022-06-24",
    runtime: 95,
    genres: ["Comedy", "Drama", "Family"],
    cast: [
      { id: 20, name: "Zoe Baptiste", character: "CEO Mia" },
      { id: 21, name: "Danny Okonkwo", character: "CFO Reg" },
    ],
  },
  {
    id: "movie-90011",
    tmdbId: 90011,
    type: "movie",
    title: "Undertow",
    tagline: "She can hold her breath longer than she can hold a secret.",
    overview:
      "A champion free-diver agrees to help stage a drowning for an insurance payout, then finds the sea unwilling to keep the lie.",
    rating: 6.9,
    releaseDate: "2021-09-09",
    runtime: 108,
    genres: ["Thriller", "Drama", "Crime"],
    cast: [
      { id: 22, name: "Camille Aubry", character: "Wren" },
      { id: 23, name: "Hector Ramos", character: "Dov" },
    ],
  },
  {
    id: "movie-90012",
    tmdbId: 90012,
    type: "movie",
    title: "The Cartographer's Wife",
    tagline: "He mapped the world. She was the part he left blank.",
    overview:
      "In 1911, the overlooked wife of a celebrated explorer sets out to finish the survey he never returned from, redrawing far more than a coastline.",
    rating: 7.7,
    releaseDate: "2017-11-03",
    runtime: 129,
    genres: ["Drama", "Romance", "History"],
    cast: [
      { id: 24, name: "Beatrix Holm", character: "Edith" },
      { id: 25, name: "Samuel Adeyemi", character: "Kwame" },
    ],
  },
  {
    id: "movie-90013",
    tmdbId: 90013,
    type: "movie",
    title: "Redshift",
    tagline: "The message took a thousand years. The reply is due now.",
    overview:
      "When a dying star transmits a repeating signal, a disgraced astronomer stakes her career — and her family — on the belief that it is counting down.",
    rating: 7.5,
    releaseDate: "2024-04-19",
    runtime: 114,
    genres: ["Sci-Fi", "Drama"],
    cast: [
      { id: 26, name: "Yuki Tanaka", character: "Dr. Sol" },
      { id: 27, name: "Grace Abara", character: "Mission Lead" },
    ],
  },
  {
    id: "movie-90014",
    tmdbId: 90014,
    type: "movie",
    title: "Brass Kingdom",
    tagline: "A city that runs on clockwork just skipped a beat.",
    overview:
      "A clockwork city wakes to find its great mainspring stolen. A gutter mechanic and a runaway noble have until the last gear stops to wind it back.",
    rating: 7.4,
    releaseDate: "2023-12-08",
    runtime: 126,
    genres: ["Fantasy", "Adventure", "Action"],
    cast: [
      { id: 28, name: "Freya Sørensen", character: "Pip" },
      { id: 29, name: "Emeka Balogun", character: "Lord Vane" },
    ],
  },

  // ---------------------------- SERIES ----------------------------
  {
    id: "tv-90101",
    tmdbId: 90101,
    type: "tv",
    title: "Nightmarket",
    tagline: "Everything's for sale after midnight.",
    overview:
      "A beloved noodle vendor at a bustling night market discovers the stalls around her are laundering more than money — and that staying neutral is no longer on the menu.",
    rating: 8.3,
    releaseDate: "2022-01-14",
    genres: ["Crime", "Drama", "Thriller"],
    cast: [
      { id: 30, name: "Mai Nguyen", character: "Lin" },
      { id: 31, name: "Rashid Omar", character: "Inspector Baz" },
    ],
    seasons: [
      season(1, "Season 1", [
        ep(1, 1, "Closing Time", "Lin witnesses a handoff she was never meant to see."),
        ep(1, 2, "Small Bills", "A regular customer offers Lin a dangerous favor."),
        ep(1, 3, "The Weighing", "Debts come due across the market."),
        ep(1, 4, "Ash & Star Anise", "Lin makes a choice that can't be unmade.", 54),
      ]),
      season(2, "Season 2", [
        ep(2, 1, "New Management", "The market reopens under a colder hand."),
        ep(2, 2, "Recipes", "Lin trades secrets to survive."),
        ep(2, 3, "Curfew", "A raid forces old allies together."),
        ep(2, 4, "Last Orders", "The books are finally balanced.", 58),
      ]),
    ],
  },
  {
    id: "tv-90102",
    tmdbId: 90102,
    type: "tv",
    title: "The Fold",
    tagline: "In this town, yesterday is just down the road.",
    overview:
      "The residents of a fog-bound town realize time there does not run straight but folds — letting the past leak into the present, one street at a time.",
    rating: 8.6,
    releaseDate: "2023-09-22",
    genres: ["Sci-Fi", "Mystery", "Drama"],
    cast: [
      { id: 32, name: "Nadia Petrova", character: "Sheriff Cole" },
      { id: 33, name: "Oscar Lund", character: "The Watchmaker" },
    ],
    seasons: [
      season(1, "Season 1", [
        ep(1, 1, "Tuesday, Again", "A missing hiker returns three years younger."),
        ep(1, 2, "The Overlap", "Two versions of the same day collide downtown."),
        ep(1, 3, "Creases", "Cole maps where the folds appear."),
        ep(1, 4, "Origami", "The town learns it can be refolded on purpose.", 57),
      ]),
      season(2, "Season 2", [
        ep(2, 1, "Unfolding", "Someone is smoothing the folds — and erasing people."),
        ep(2, 2, "The Seam", "Cole finds the place where all the folds meet."),
        ep(2, 3, "Pressed Flat", "A day that refuses to end."),
      ]),
    ],
  },
  {
    id: "tv-90103",
    tmdbId: 90103,
    type: "tv",
    title: "Coastline",
    tagline: "Three families. One harbor. Every secret floats.",
    overview:
      "When a new marina threatens a fading fishing town, three families find their fortunes, feuds, and long-buried secrets dragged back up with the tide.",
    rating: 7.8,
    releaseDate: "2021-04-02",
    genres: ["Drama"],
    cast: [
      { id: 34, name: "Bridget Kelly", character: "Maureen" },
      { id: 35, name: "Tunde Bakare", character: "Femi" },
    ],
    seasons: [
      season(1, "Season 1", [
        ep(1, 1, "High Water", "The marina developers make their first offer."),
        ep(1, 2, "Nets", "Old debts surface between the families."),
        ep(1, 3, "Slack Tide", "A storm forces an uneasy truce."),
        ep(1, 4, "Landfall", "The vote that decides the harbor.", 52),
      ]),
    ],
  },
  {
    id: "tv-90104",
    tmdbId: 90104,
    type: "tv",
    title: "Paper Lanterns",
    tagline: "One night a year, the dead come to shop.",
    overview:
      "A teenager who can see the recently departed takes a summer job at the spirit festival, guiding the dead through their last night among the living.",
    rating: 8.0,
    releaseDate: "2024-08-16",
    genres: ["Fantasy", "Adventure", "Drama"],
    cast: [
      { id: 36, name: "Suki Rahman", character: "Ani" },
      { id: 37, name: "Leon Fischer", character: "The Lamplighter" },
    ],
    seasons: [
      season(1, "Season 1", [
        ep(1, 1, "First Light", "Ani lights the first lantern of the season."),
        ep(1, 2, "The Long Queue", "A spirit refuses to move on."),
        ep(1, 3, "Wick's End", "Ani learns what the festival costs its guides.", 50),
      ]),
    ],
  },
  {
    id: "tv-90105",
    tmdbId: 90105,
    type: "tv",
    title: "Static",
    tagline: "You're on the air. Someone's on the line.",
    overview:
      "A late-night pirate-radio host starts receiving calls that predict the following day's disasters — and realizes the broadcast may be causing them.",
    rating: 7.6,
    releaseDate: "2020-10-30",
    genres: ["Thriller", "Mystery"],
    cast: [
      { id: 38, name: "Vera Cruz", character: "DJ Mox" },
      { id: 39, name: "Aaron Dube", character: "Caller 9" },
    ],
    seasons: [
      season(1, "Season 1", [
        ep(1, 1, "Dead Air", "Mox takes a call that hasn't happened yet."),
        ep(1, 2, "Feedback", "The predictions start coming true."),
        ep(1, 3, "Sign Off", "Mox decides whether to keep broadcasting.", 55),
      ]),
    ],
  },
  {
    id: "tv-90106",
    tmdbId: 90106,
    type: "tv",
    title: "Greenhouse Kings",
    tagline: "May the best bloom win.",
    overview:
      "Two rival botanists share a wall — and nothing else — as their competing greenhouses turn a quiet allotment into an all-out horticultural arms race.",
    rating: 7.2,
    releaseDate: "2019-05-11",
    genres: ["Comedy"],
    cast: [
      { id: 40, name: "Pat Sullivan", character: "Bas" },
      { id: 41, name: "Ingrid Møller", character: "Dot" },
    ],
    seasons: [
      season(1, "Season 1", [
        ep(1, 1, "Germination", "Bas discovers a new neighbor with better light."),
        ep(1, 2, "Cross-Pollination", "A prize orchid goes missing."),
        ep(1, 3, "Blight", "Sabotage, or bad luck?"),
        ep(1, 4, "Show Day", "The regional flower show arrives.", 30),
      ]),
      season(2, "Season 2", [
        ep(2, 1, "Repotting", "A truce, briefly."),
        ep(2, 2, "Hardening Off", "The rivalry goes national."),
      ]),
    ],
  },
  {
    id: "tv-90107",
    tmdbId: 90107,
    type: "tv",
    title: "The Ledger",
    tagline: "The numbers always confess.",
    overview:
      "A forensic accountant with a photographic memory is recruited to unpick a shipping empire's books, one impossible entry at a time.",
    rating: 8.1,
    releaseDate: "2023-02-09",
    genres: ["Crime", "Thriller", "Drama"],
    cast: [
      { id: 42, name: "Cora Bloom", character: "Devi Rao" },
      { id: 43, name: "Magnus Holt", character: "Chairman Voss" },
    ],
    seasons: [
      season(1, "Season 1", [
        ep(1, 1, "Opening Balance", "Devi finds a rounding error worth millions."),
        ep(1, 2, "Accruals", "Someone starts editing the past."),
        ep(1, 3, "Write-Down", "A whistleblower vanishes."),
        ep(1, 4, "Reconciliation", "The books finally balance — against someone.", 56),
      ]),
    ],
  },
  {
    id: "tv-90108",
    tmdbId: 90108,
    type: "tv",
    title: "Migration",
    tagline: "Everything alive is going somewhere.",
    overview:
      "A wildlife camera operator and a grieving climatologist follow one great animal migration across a continent, and the human stories tangled in its path.",
    rating: 7.9,
    releaseDate: "2018-03-18",
    genres: ["Documentary", "Drama"],
    cast: [
      { id: 44, name: "Nomsa Dlamini", character: "Herself" },
      { id: 45, name: "Erik Halvorsen", character: "Himself" },
    ],
    seasons: [
      season(1, "Season 1", [
        ep(1, 1, "Departure", "The herd leaves the highlands.", 44),
        ep(1, 2, "The Crossing", "A river stands between life and the dry season.", 44),
        ep(1, 3, "Arrival", "What waits at the end of the road.", 44),
      ]),
    ],
  },
];
