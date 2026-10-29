// Expands the Cricsheet short names in the generated stats index ("RG Sharma",
// "V Kohli") into the everyday names the ICC player directory carries
// ("Rohit Sharma", "Virat Kohli"), and keeps the ICC id so the pickers can
// show the official portrait. The stats index itself stays untouched — this
// writes a small id → { name, iccId } map that `stats-db.ts` prefers when it
// builds each player summary, so the roster, head-to-head pickers and player
// cards all print and search the familiar name.
//
// Run after `scripts/build-cricket-stats.py`:
//   node scripts/build-cricket-names.mjs
//
// Matching is deliberately conservative. A short name is only expanded when
// exactly one ICC player in the same country and gender has that surname and
// first initial, so an ambiguous or misspelt row keeps its initials instead of
// being given someone else's name.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STATS = path.join(ROOT, "src", "lib", "cricket", "generated", "cricket-stats.json");
const OUT = path.join(ROOT, "src", "lib", "cricket", "generated", "player-names.json");

const DIRECTORY_URL = "https://assets-icc.sportz.io/cricket/v1/player";
// Public client id the ICC site itself sends; no key is issued for this feed.
const CLIENT_ID = "tPZJbRgIub3Vua93/DWtyQ==";
const PAGE_SIZE = 1000;

// ICC spells a handful of countries differently from Cricsheet.
const COUNTRY_ALIASES = {
  czechrepublic: "czechia",
  turkey: "turkiye",
  turksandcaucosisland: "turksandcaucosislands",
  unitedstatesofamerica: "usa",
};

const normCountry = (value) => {
  const key = String(value ?? "")
    .replace(/\s+Women$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return COUNTRY_ALIASES[key] ?? key;
};
const normName = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
const isInitialToken = (token) => /^[A-Z]{1,4}$/.test(token);

async function fetchDirectory() {
  const rows = [];
  for (let page = 1; page <= 40; page += 1) {
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      feed_format: "json",
      lang: "en",
      pagination: "true",
      page_number: String(page),
      page_size: String(PAGE_SIZE),
    });
    const response = await fetch(`${DIRECTORY_URL}?${query}`, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
      },
    });
    if (!response.ok) throw new Error(`ICC directory page ${page} returned ${response.status}`);
    const body = await response.json();
    const data = Array.isArray(body.data) ? body.data : [];
    rows.push(...data);
    process.stderr.write(`ICC directory page ${page}: ${data.length} rows\n`);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

const index = JSON.parse(readFileSync(STATS, "utf8"));
const directory = await fetchDirectory();

/** Initials of a full name: "Stephen Peter Devereux Smith" → "SPDS". */
function fullNameInitials(fullName) {
  return String(fullName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// surname + first initial + country + gender → every ICC name that fits.
const candidates = new Map();
for (const row of directory) {
  const name = String(row.name ?? "").trim();
  const nationality = String(row.nationality ?? "").trim();
  const tokens = name.split(/\s+/);
  if (tokens.length < 2 || !nationality) continue;
  const first = tokens[0];
  // An ICC row that is itself initials adds nothing.
  if (isInitialToken(first) || first.length <= 2) continue;
  const gender = row.gender === "F" ? "women" : "men";
  const key = `${normName(tokens.at(-1))}|${first[0].toLowerCase()}|${normCountry(nationality)}|${gender}`;
  const list = candidates.get(key) ?? [];
  list.push({ id: String(row.id), name, initials: fullNameInitials(row.full_name || name) });
  candidates.set(key, list);
}

// The face transform answers with an identical grey silhouette when a player
// has no portrait, so each candidate is checked against the untransformed
// asset and stored only when it really exists.
const portraitAsset = (iccId) =>
  `https://images.icc-cricket.com/image/upload/prd/assets/players/generic/colored/${iccId}.png`;
const portraitExists = async (iccId) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(portraitAsset(iccId), {
        method: "HEAD",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 404) return false;
      if (response.ok) return true;
    } catch {
      // Fall through to the backoff: only a 404 is a definitive "no portrait".
    }
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  // Transient failures keep the URL: a real portrait is worth more than the
  // rare grey silhouette this accepts in its place.
  return null;
};

const players = {};
let expanded = 0;
let identified = 0;
let ambiguous = 0;
let untouched = 0;

for (const player of index.players) {
  const tokens = String(player.name ?? "").split(/\s+/);
  const initials = tokens.slice(0, -1);
  if (tokens.length < 2 || initials.length === 0) {
    untouched += 1;
    continue;
  }
  const country = normCountry(player.team);

  // Already a full name ("Shubman Gill"): the name needs no change, but the
  // ICC id is still worth keeping for the portrait. Only an exact name match
  // is accepted here, because there is no initial to verify against.
  if (!initials.every(isInitialToken)) {
    const key = `${normName(tokens.at(-1))}|${tokens[0][0].toLowerCase()}|${country}|${player.gender}`;
    const exact = (candidates.get(key) ?? []).filter(
      (option) => normName(option.name) === normName(player.name)
    );
    if (exact.length === 1) {
      players[player.id] = { name: player.name, iccId: exact[0].id };
      identified += 1;
    } else {
      untouched += 1;
    }
    continue;
  }

  const shortInitials = initials.join("").replace(/\./g, "").toUpperCase();
  const key = `${normName(tokens.at(-1))}|${shortInitials[0].toLowerCase()}|${country}|${player.gender}`;
  const options = (candidates.get(key) ?? []).filter(
    (option) => option.name.toLowerCase() !== player.name.toLowerCase()
  );
  if (options.length === 0) {
    untouched += 1;
    continue;
  }

  // Full names settle most same-surname clashes ("RG Sharma" vs "Rahul
  // Sharma" both start with R); fall back to a lone surname match so players
  // whose register omits a middle name ("MS Starc") still resolve.
  const exact = options.filter((option) => option.initials.startsWith(shortInitials));
  const chosen = exact.length === 1 ? exact : options.length === 1 ? options : null;
  if (!chosen) {
    ambiguous += 1;
    continue;
  }
  players[player.id] = { name: chosen[0].name, iccId: chosen[0].id };
  expanded += 1;
}

const queue = Object.entries(players);
let portraits = 0;
let unknown = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length > 0) {
      const [, entry] = queue.shift();
      const exists = await portraitExists(entry.iccId);
      if (exists === false) delete entry.iccId;
      else if (exists) portraits += 1;
      else unknown += 1;
    }
  })
);

writeFileSync(OUT, `${JSON.stringify(players, null, 0)}\n`);
console.log(
  `Wrote ${OUT}: ${expanded} names expanded, ${identified} already full, ` +
    `${ambiguous} ambiguous, ${untouched} unmatched; ${portraits} portraits verified` +
    `${unknown ? `, ${unknown} unverified but kept` : ""}.`
);
