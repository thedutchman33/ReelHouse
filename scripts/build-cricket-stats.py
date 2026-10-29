#!/usr/bin/env python3
"""Build the international cricket stats index from Cricsheet ball-by-ball data.

The page needs three things the live BCCI/ICC feeds do not publish:

* career and season totals for every international player, not only India's
  contracted squad;
* batter vs bowler head-to-heads (balls, runs, boundaries, dismissals, dots,
  last encounter);
* team head-to-head records.

Cricsheet publishes the ball-by-ball archive for every international match.
This script downloads the archives into `.tmp/cricsheet`, aggregates them, and
writes a compact JSON index consumed by the server routes. Re-run it whenever
the archives are refreshed:

    python scripts/build-cricket-stats.py

Output: src/lib/cricket/generated/cricket-stats.json

Every number is observed from a real delivery. Nothing is estimated. The index
is compact (short keys, array records) because it ships in the server bundle.
"""

from __future__ import annotations

import json
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".tmp" / "cricsheet"
OUT = ROOT / "src" / "lib" / "cricket" / "generated" / "cricket-stats.json"

ARCHIVES = [
    ("tests_male", "Test"),
    ("odis_male", "ODI"),
    ("t20s_male", "T20I"),
    ("odis_female", "ODI"),
    ("t20s_female", "T20I"),
]

FORMATS = ["Test", "ODI", "T20I"]
FMT_INDEX = {name: index for index, name in enumerate(FORMATS)}

TEAM_CODES = {
    "Afghanistan": "AFG",
    "Africa XI": "AFR",
    "Asia XI": "ASI",
    "Australia": "AUS",
    "Austria": "AUT",
    "Bahrain": "BHR",
    "Bangladesh": "BAN",
    "Belgium": "BEL",
    "Bermuda": "BER",
    "Botswana": "BOT",
    "Brazil": "BRA",
    "Bulgaria": "BUL",
    "Cambodia": "CAM",
    "Cameroon": "CMR",
    "Canada": "CAN",
    "Chile": "CHI",
    "China": "CHN",
    "Cook Islands": "COK",
    "Costa Rica": "CRC",
    "Croatia": "CRO",
    "Cyprus": "CYP",
    "Czech Republic": "CZE",
    "Denmark": "DEN",
    "East Africa": "EAF",
    "England": "ENG",
    "Estonia": "EST",
    "Eswatini": "SWZ",
    "Fiji": "FIJ",
    "Finland": "FIN",
    "France": "FRA",
    "Gambia": "GAM",
    "Germany": "GER",
    "Ghana": "GHA",
    "Gibraltar": "GIB",
    "Greece": "GRE",
    "Guernsey": "GGY",
    "Hong Kong": "HKG",
    "Hungary": "HUN",
    "Iceland": "ISL",
    "India": "IND",
    "Indonesia": "IDN",
    "Iran": "IRN",
    "Ireland": "IRE",
    "Isle of Man": "IOM",
    "Israel": "ISR",
    "Italy": "ITA",
    "Ivory Coast": "CIV",
    "Japan": "JPN",
    "Jersey": "JEY",
    "Kenya": "KEN",
    "Kuwait": "KUW",
    "Lesotho": "LES",
    "Luxembourg": "LUX",
    "Malawi": "MWI",
    "Malaysia": "MAS",
    "Maldives": "MDV",
    "Mali": "MLI",
    "Malta": "MLT",
    "Mexico": "MEX",
    "Mozambique": "MOZ",
    "Myanmar": "MYA",
    "Namibia": "NAM",
    "Nepal": "NEP",
    "Netherlands": "NED",
    "New Zealand": "NZ",
    "Nigeria": "NGA",
    "Norway": "NOR",
    "Oman": "OMA",
    "Pakistan": "PAK",
    "Panama": "PAN",
    "Papua New Guinea": "PNG",
    "Philippines": "PHI",
    "Portugal": "POR",
    "Qatar": "QAT",
    "Romania": "ROU",
    "Rwanda": "RWA",
    "Samoa": "SAM",
    "Saudi Arabia": "KSA",
    "Scotland": "SCO",
    "Serbia": "SRB",
    "Seychelles": "SEY",
    "Sierra Leone": "SLE",
    "Singapore": "SGP",
    "Slovenia": "SLO",
    "South Africa": "SA",
    "South Korea": "KOR",
    "Spain": "ESP",
    "Sri Lanka": "SL",
    "St Helena": "SHN",
    "Sweden": "SWE",
    "Switzerland": "SUI",
    "Tanzania": "TAN",
    "Thailand": "THA",
    "Turkey": "TUR",
    "Uganda": "UGA",
    "United Arab Emirates": "UAE",
    "United States of America": "USA",
    "Vanuatu": "VAN",
    "West Indies": "WI",
    "Zimbabwe": "ZIM",
}

CREDITED = {
    "bowled",
    "caught",
    "lbw",
    "stumped",
    "hit wicket",
    "caught and bowled",
}
DISMISSAL_BUCKET = {
    "bowled": 0,
    "caught": 1,
    "caught and bowled": 1,
    "lbw": 2,
    "stumped": 3,
}


def team_code(name: str, gender: str) -> str:
    bare = name[: -len(" Women")] if name.endswith(" Women") else name
    code = TEAM_CODES.get(bare)
    if not code:
        code = "".join(part[0] for part in bare.split()[:3]).upper()
    if gender == "women":
        return f"{code}W"[:4]
    return code[:3]


def download(name: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / f"{name}.zip"
    if target.exists() and target.stat().st_size > 100_000:
        return target
    url = f"https://cricsheet.org/downloads/{name}_json.zip"
    print(f"downloading {url}", flush=True)
    urllib.request.urlretrieve(url, target)
    return target


def main() -> None:
    matches: list[dict] = []
    players: dict[str, dict] = {}
    teams: dict[str, dict] = defaultdict(lambda: {"players": set(), "last": "", "gender": "men"})
    pairs: list[list[int]] = []
    pair_index: dict[tuple[str, str], int] = {}
    team_records: dict[tuple[str, str], list[int]] = {}
    seasons: dict[str, dict[str, dict]] = defaultdict(dict)

    def player(pid: str, name: str, gender: str) -> dict:
        entry = players.get(pid)
        if entry is None:
            entry = {
                "name": name,
                "gender": gender,
                "last": "",
                "first": "",
                "team": "",
                "teams": set(),
                "matches": set(),
                "match_formats": [set(), set(), set()],
                "bat": {
                    "inns": 0,
                    "runs": 0,
                    "balls": 0,
                    "no": 0,
                    "hs": 0,
                    "hsNo": False,
                    "fours": 0,
                    "sixes": 0,
                    "outs": 0,
                    "hundreds": 0,
                    "fifties": 0,
                    "ducks": 0,
                    "catches": 0,
                    "dots": 0,
                    "formats": [dict(inns=0, runs=0, balls=0, no=0, hs=0, hsNo=False, fours=0, sixes=0, outs=0, hundreds=0, fifties=0, ducks=0, dots=0) for _ in range(3)],
                },
                "bowl": {
                    "inns": 0,
                    "balls": 0,
                    "runs": 0,
                    "wkts": 0,
                    "bestW": 0,
                    "bestR": 0,
                    "five": 0,
                    "dots": 0,
                    "formats": [dict(inns=0, balls=0, runs=0, wkts=0, bestW=0, bestR=0, five=0, dots=0) for _ in range(3)],
                },
            }
            players[pid] = entry
        entry["teams"].add("")
        return entry

    count = 0
    for archive, _fmt in ARCHIVES:
        path = download(archive)
        with zipfile.ZipFile(path) as zf:
            names = sorted(n for n in zf.namelist() if n.endswith(".json"))
            print(f"{archive}: {len(names)} matches", flush=True)
            for filename in names:
                try:
                    data = json.loads(zf.read(filename))
                except (json.JSONDecodeError, KeyError):
                    continue
                info = data.get("info") or {}
                match_type = "T20I" if info.get("match_type") == "T20" else info.get("match_type")
                if match_type not in FMT_INDEX:
                    continue
                fmt = FMT_INDEX[match_type]
                gender = "women" if info.get("gender") == "female" else "men"
                team_names = info.get("teams") or []
                if len(team_names) != 2:
                    continue
                # Cricsheet uses the same team name for the men's and women's
                # sides. Keep them apart everywhere the page renders a team.
                display_names = [
                    f"{name} Women" if gender == "women" and not name.endswith(" Women") else name
                    for name in team_names
                ]
                date_text = (info.get("dates") or [""])[0]
                if not date_text:
                    continue
                year = date_text[:4]
                registry = ((info.get("registry") or {}).get("people")) or {}
                squads = info.get("players") or {}
                outcome = info.get("outcome") or {}
                winner = outcome.get("winner") or ""
                result = outcome.get("result") or ""
                by = outcome.get("by") or {}
                if winner:
                    margin = ""
                    if by:
                        key, value = next(iter(by.items()))
                        margin = f" by {value} {key}"
                    result_text = f"{winner} won{margin}"
                elif result == "tie":
                    result_text = "Match tied"
                elif result == "draw":
                    result_text = "Match drawn"
                elif result == "no result":
                    result_text = "No result"
                else:
                    result_text = ""

                match_index = len(matches)
                ordinal = date.fromisoformat(date_text).toordinal()
                matches.append(
                    {
                        "d": date_text,
                        "v": info.get("venue") or "",
                        "c": info.get("city") or "",
                        "a": display_names[0],
                        "b": display_names[1],
                        "w": winner,
                        "r": result_text,
                        "f": fmt,
                        "g": gender,
                    }
                )
                count += 1

                # Every registered player in either squad gets an appearance,
                # a team and a season row.
                for raw_team, team_name in zip(team_names, display_names):
                    team = teams[team_name]
                    team["last"] = max(team["last"], date_text)
                    team["gender"] = gender
                    for display in squads.get(raw_team) or []:
                        pid = registry.get(display)
                        if not pid:
                            continue
                        entry = players.get(pid)
                        if entry is None:
                            entry = player(pid, display, gender)
                        if date_text >= entry["last"]:
                            entry["name"] = display
                            entry["team"] = team_name
                            entry["gender"] = gender
                            entry["last"] = date_text
                        if not entry["first"] or date_text < entry["first"]:
                            entry["first"] = date_text
                        entry["teams"].discard("")
                        entry["teams"].add(team_name)
                        entry["matches"].add(match_index)
                        entry["match_formats"][fmt].add(match_index)
                        team["players"].add(pid)
                        bucket = seasons[pid].setdefault(
                            year, {"m": set(), "runs": 0, "balls": 0, "wkts": 0, "bowlBalls": 0}
                        )
                        bucket["m"].add(match_index)

                per_match: dict[tuple[str, str], list[int]] = {}

                def pair_row(batter: str, bowler: str) -> list[int]:
                    key = (batter, bowler)
                    slot = per_match.get(key)
                    if slot is None:
                        slot = [0] * 12
                        per_match[key] = slot
                    return slot

                for innings in data.get("innings") or []:
                    if innings.get("super_over"):
                        continue
                    batting_team = innings.get("team")
                    if batting_team not in team_names:
                        continue
                    batted: set[str] = set()
                    bowled: set[str] = set()
                    bat_runs: dict[str, int] = defaultdict(int)
                    bat_balls: dict[str, int] = defaultdict(int)
                    bat_fours: dict[str, int] = defaultdict(int)
                    bat_sixes: dict[str, int] = defaultdict(int)
                    bat_dots: dict[str, int] = defaultdict(int)
                    bat_out: dict[str, int] = defaultdict(int)
                    bowl_balls: dict[str, int] = defaultdict(int)
                    bowl_runs: dict[str, int] = defaultdict(int)
                    bowl_wkts: dict[str, int] = defaultdict(int)
                    bowl_dots: dict[str, int] = defaultdict(int)
                    dismissal: dict[str, str] = {}

                    for over in innings.get("overs") or []:
                        for delivery in over.get("deliveries") or []:
                            bat_name = delivery.get("batter")
                            bowl_name = delivery.get("bowler")
                            if not bat_name or not bowl_name:
                                continue
                            batter = registry.get(bat_name) or bat_name
                            bowler = registry.get(bowl_name) or bowl_name
                            if batter not in players:
                                player(batter, bat_name, gender)
                            if bowler not in players:
                                player(bowler, bowl_name, gender)
                            runs = delivery.get("runs") or {}
                            extras = delivery.get("extras") or {}
                            off_bat = int(runs.get("batter") or 0)
                            wide = int(extras.get("wides") or 0) > 0
                            total = int(runs.get("total") or 0)
                            slot = pair_row(batter, bowler)
                            batted.add(batter)
                            bowled.add(bowler)

                            if not wide:
                                slot[1] += 1
                                bat_balls[batter] += 1
                                bowl_balls[bowler] += 1
                                if total == 0:
                                    slot[5] += 1
                                    bat_dots[batter] += 1
                                    bowl_dots[bowler] += 1
                            slot[0] += off_bat
                            bat_runs[batter] += off_bat
                            if off_bat == 4:
                                slot[2] += 1
                                bat_fours[batter] += 1
                            elif off_bat == 6:
                                slot[3] += 1
                                bat_sixes[batter] += 1
                            conceded = off_bat + int(extras.get("wides") or 0) + int(extras.get("noballs") or 0)
                            bowl_runs[bowler] += conceded

                            for wicket in delivery.get("wickets") or []:
                                out_name = wicket.get("player_out")
                                kind = str(wicket.get("kind") or "")
                                if not out_name:
                                    continue
                                out_id = registry.get(out_name) or out_name
                                dismissal[out_id] = kind
                                if out_id == batter and kind in CREDITED:
                                    slot[4] += 1
                                    slot[6 + DISMISSAL_BUCKET.get(kind, 4)] += 1
                                    bat_out[batter] = 1
                                    bowl_wkts[bowler] += 1
                                for fielder in wicket.get("fielders") or []:
                                    fname = fielder.get("name")
                                    if not fname:
                                        continue
                                    fid = registry.get(fname) or fname
                                    if fid in players:
                                        players[fid]["bat"]["catches"] += 1

                    for batter in batted:
                        entry = players[batter]
                        bat = entry["bat"]
                        runs_value = bat_runs[batter]
                        balls_value = bat_balls[batter]
                        out = bool(bat_out[batter])
                        bat["inns"] += 1
                        bat["runs"] += runs_value
                        bat["balls"] += balls_value
                        bat["fours"] += bat_fours[batter]
                        bat["sixes"] += bat_sixes[batter]
                        bat["dots"] += bat_dots[batter]
                        if out:
                            bat["outs"] += 1
                            if runs_value == 0:
                                bat["ducks"] += 1
                        else:
                            bat["no"] += 1
                        if runs_value > bat["hs"] or (runs_value == bat["hs"] and not out):
                            bat["hs"] = runs_value
                            bat["hsNo"] = not out
                        if runs_value >= 100:
                            bat["hundreds"] += 1
                        elif runs_value >= 50:
                            bat["fifties"] += 1
                        frow = bat["formats"][fmt]
                        frow["inns"] += 1
                        frow["runs"] += runs_value
                        frow["balls"] += balls_value
                        frow["fours"] += bat_fours[batter]
                        frow["sixes"] += bat_sixes[batter]
                        frow["dots"] += bat_dots[batter]
                        if out:
                            frow["outs"] += 1
                            if runs_value == 0:
                                frow["ducks"] += 1
                        else:
                            frow["no"] += 1
                        if runs_value > frow["hs"] or (runs_value == frow["hs"] and not out):
                            frow["hs"] = runs_value
                            frow["hsNo"] = not out
                        if runs_value >= 100:
                            frow["hundreds"] += 1
                        elif runs_value >= 50:
                            frow["fifties"] += 1
                        season = seasons[batter].setdefault(
                            year, {"m": set(), "runs": 0, "balls": 0, "wkts": 0, "bowlBalls": 0}
                        )
                        season["runs"] += runs_value
                        season["balls"] += balls_value

                    for bowler in bowled:
                        entry = players[bowler]
                        bowl = entry["bowl"]
                        wkts = bowl_wkts[bowler]
                        conceded = bowl_runs[bowler]
                        bowl["inns"] += 1
                        bowl["balls"] += bowl_balls[bowler]
                        bowl["runs"] += conceded
                        bowl["wkts"] += wkts
                        bowl["dots"] += bowl_dots[bowler]
                        if wkts > bowl["bestW"] or (wkts == bowl["bestW"] and conceded < bowl["bestR"]):
                            bowl["bestW"] = wkts
                            bowl["bestR"] = conceded
                        if wkts >= 5:
                            bowl["five"] += 1
                        frow = bowl["formats"][fmt]
                        frow["inns"] += 1
                        frow["balls"] += bowl_balls[bowler]
                        frow["runs"] += conceded
                        frow["wkts"] += wkts
                        frow["dots"] += bowl_dots[bowler]
                        if wkts > frow["bestW"] or (wkts == frow["bestW"] and conceded < frow["bestR"]):
                            frow["bestW"] = wkts
                            frow["bestR"] = conceded
                        if wkts >= 5:
                            frow["five"] += 1
                        season = seasons[bowler].setdefault(
                            year, {"m": set(), "runs": 0, "balls": 0, "wkts": 0, "bowlBalls": 0}
                        )
                        season["wkts"] += wkts
                        season["bowlBalls"] += bowl_balls[bowler]

                # Merge the match's pair rows once, after every innings.
                for key, slot in per_match.items():
                    idx = pair_index.get(key)
                    if idx is None:
                        idx = len(pairs)
                        pair_index[key] = idx
                        pairs.append([0] * 31)
                    row = pairs[idx]
                    row[0] += slot[1]
                    row[1] += slot[0]
                    row[2] += slot[2]
                    row[3] += slot[3]
                    row[4] += slot[4]
                    row[5] += slot[5]
                    row[6] += 1
                    base = 7 + fmt * 4
                    row[base] += 1
                    row[base + 1] += slot[1]
                    row[base + 2] += slot[0]
                    row[base + 3] += slot[4]
                    for bucket in range(5):
                        row[19 + bucket] += slot[6 + bucket]
                    if row[30] <= ordinal:
                        row[24] = match_index
                        row[25] = slot[0]
                        row[26] = slot[1]
                        row[27] = slot[2]
                        row[28] = slot[3]
                        row[29] = 1 if slot[4] else 0
                        row[30] = ordinal

                a_name, b_name = sorted(display_names)
                record = team_records.setdefault((a_name, b_name), [0] * 15)
                record[0] += 1
                record[1 + fmt] += 1
                if winner == a_name:
                    record[4 + fmt] += 1
                elif winner == b_name:
                    record[7 + fmt] += 1
                elif result == "draw":
                    record[10] += 1
                elif result == "tie":
                    record[11] += 1
                else:
                    record[12] += 1
                if record[14] <= ordinal:
                    record[13] = match_index
                    record[14] = ordinal

        print(f"processed {count} matches; players {len(players)}; teams {len(teams)}", flush=True)

    max_date = max((m["d"] for m in matches), default=date.today().isoformat())
    max_ordinal = date.fromisoformat(max_date).toordinal()
    cutoff_ordinal = max_ordinal - 731
    cutoff = date.fromordinal(cutoff_ordinal).isoformat()

    active = {
        pid
        for pid, entry in players.items()
        if entry["last"] and date.fromisoformat(entry["last"]).toordinal() >= cutoff_ordinal
    }

    # Compact player rows, sorted by name for stable diffs.
    ordered = sorted(active, key=lambda pid: (players[pid]["name"], pid))
    index_of: dict[str, int] = {}
    player_rows: list[dict] = []
    for pid in ordered:
        entry = players[pid]
        bat = entry["bat"]
        bowl = entry["bowl"]
        appearances = len(entry["matches"])
        if bowl["wkts"] >= 40 and bowl["balls"] > bat["balls"] * 1.2:
            role = "Bowler"
        elif bowl["wkts"] >= 40 and bat["inns"] >= 20:
            role = "All-rounder"
        else:
            role = "Batter"
        season_rows = []
        for year in sorted(seasons.get(pid, {})):
            row = seasons[pid][year]
            if not row["m"]:
                continue
            season_rows.append(
                [year, len(row["m"]), row["runs"], row["balls"], row["wkts"], row["bowlBalls"]]
            )
        player_rows.append(
            {
                "id": pid,
                "name": entry["name"],
                "gender": entry["gender"],
                "team": entry["team"],
                "role": role,
                "last": entry["last"],
                "first": entry["first"],
                "matches": appearances,
                "bat": {
                    "inns": bat["inns"],
                    "runs": bat["runs"],
                    "balls": bat["balls"],
                    "no": bat["no"],
                    "hs": bat["hs"],
                    "hsNo": bat["hsNo"],
                    "fours": bat["fours"],
                    "sixes": bat["sixes"],
                    "outs": bat["outs"],
                    "hundreds": bat["hundreds"],
                    "fifties": bat["fifties"],
                    "ducks": bat["ducks"],
                    "catches": bat["catches"],
                    "dots": bat["dots"],
                    "formats": [
                        {
                            "m": len(entry["match_formats"][i]),
                            "inns": row["inns"],
                            "runs": row["runs"],
                            "balls": row["balls"],
                            "no": row["no"],
                            "hs": row["hs"],
                            "hsNo": row["hsNo"],
                            "fours": row["fours"],
                            "sixes": row["sixes"],
                            "outs": row["outs"],
                            "hundreds": row["hundreds"],
                            "fifties": row["fifties"],
                            "ducks": row["ducks"],
                            "dots": row["dots"],
                        }
                        for i, row in enumerate(bat["formats"])
                    ],
                },
                "bowl": {
                    "inns": bowl["inns"],
                    "balls": bowl["balls"],
                    "runs": bowl["runs"],
                    "wkts": bowl["wkts"],
                    "bestW": bowl["bestW"],
                    "bestR": bowl["bestR"],
                    "five": bowl["five"],
                    "dots": bowl["dots"],
                    "formats": [
                        {
                            "m": len(entry["match_formats"][i]),
                            "inns": row["inns"],
                            "balls": row["balls"],
                            "runs": row["runs"],
                            "wkts": row["wkts"],
                            "bestW": row["bestW"],
                            "bestR": row["bestR"],
                            "five": row["five"],
                            "dots": row["dots"],
                        }
                        for i, row in enumerate(bowl["formats"])
                    ],
                },
                "seasons": season_rows,
            }
        )
        index_of[pid] = len(player_rows) - 1

    pair_out: dict[str, list[int]] = {}
    for (batter, bowler), idx in pair_index.items():
        bi = index_of.get(batter)
        wi = index_of.get(bowler)
        if bi is None or wi is None:
            continue
        pair_out[f"{bi}|{wi}"] = pairs[idx]

    records_out: dict[str, list[int]] = {}
    for (a_name, b_name), record in team_records.items():
        if not any(pid in active for pid in teams[a_name]["players"]):
            continue
        if not any(pid in active for pid in teams[b_name]["players"]):
            continue
        records_out[f"{a_name}|{b_name}"] = record

    team_rows: dict[str, dict] = {}
    for team_name, info in teams.items():
        roster = [index_of[pid] for pid in info["players"] if pid in index_of]
        if not roster:
            continue
        team_rows[team_name] = {
            "name": team_name,
            "code": team_code(team_name, info["gender"]),
            "gender": info["gender"],
            "last": info["last"],
            "bat": sorted(
                [i for i in roster if player_rows[i]["role"] in ("Batter", "All-rounder")],
                key=lambda i: (-player_rows[i]["bat"]["runs"], player_rows[i]["name"]),
            ),
            "bowl": sorted(
                [i for i in roster if player_rows[i]["role"] in ("Bowler", "All-rounder")],
                key=lambda i: (-player_rows[i]["bowl"]["wkts"], player_rows[i]["name"]),
            ),
            "all": sorted(roster, key=lambda i: player_rows[i]["name"]),
        }

    payload = {
        "generatedAt": date.today().isoformat(),
        "maxDate": max_date,
        "cutoff": cutoff,
        "players": player_rows,
        "teams": team_rows,
        "pairs": pair_out,
        "records": records_out,
        "matches": matches,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB)")
    print(
        f"matches {len(matches)}; active players {len(player_rows)}; "
        f"pairs {len(pair_out)}; teams {len(team_rows)}"
    )


if __name__ == "__main__":
    sys.exit(main())
