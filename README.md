# TFT Overlay

Lightweight Overwolf in-game overlay for Teamfight Tactics: stage / level / gold / shop odds,
component tracker with craftable BiS items, a comp advisor and a phase-by-phase leveling coach.

Built with Vite, React, TypeScript and Tailwind CSS.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173/in_game.html — runs in Mock Mode with a test simulator
npm run build      # type-check + production build into dist/
```

Load in Overwolf: **Settings → About → Development options → Load unpacked extension** → select `dist/`.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server. `in_game.html` = overlay (mock data), `desktop.html` = companion window, `in_game.html?live` = listen to synced live state |
| `npm run build` | `tsc -b` + Vite build → `dist/` (unpacked Overwolf app) |
| `npm run fetch-meta` | Regenerate `src/data/comps.json` from Riot's TFT Match API (see below) |

## Meta comps: remote updates without rebuilding

The overlay loads its comp list in this order:

1. **Remote** `comps.json` from `VITE_META_URL` (fetched at runtime, re-checked every 6 h)
2. **Cache** — last good remote copy in `localStorage` (instant startup, works offline)
3. **Bundled** — `src/data/comps.json` shipped inside the package

A remote file that fails validation is ignored, so a bad push can't break the overlay. The footer
shows which source is active (`Meta: live · 2h ago`, `cached`, or `built-in`).

**Setup:** commit `src/data/comps.json` to a public GitHub repo and point the app at its raw URL:

```bash
cp .env.example .env
# .env
VITE_META_URL=https://raw.githubusercontent.com/<user>/<repo>/main/tft-overlay/src/data/comps.json
```

Rebuild once (`npm run build`) so the URL is baked in. From then on, pushing a new `comps.json`
updates every install within 6 hours — no new Overwolf package needed.

> For testing, a URL can also be set at runtime from the overlay's dev console:
> `localStorage.setItem('tft.metaUrl', '<url>')`.

## Generating meta comps from the Riot API

```bash
npm run fetch-meta                              # EUW Challenger/GM, defaults
npm run fetch-meta -- --players=60 --days=5     # more players, last 5 days
npm run fetch-meta -- --dry-run                 # print result, don't write
npm run fetch-meta -- --offline                 # re-cluster cached matches, no API calls
```

What the script does:

1. Reads the **Challenger + Grandmaster** ladder (`tft-league-v1`, `euw1`) and takes the top players by LP.
2. Fetches their recent **ranked** matches (`tft-match-v1`, `europe`). Matches are cached in `.cache/riot-matches/`,
   so re-runs only download new ones.
3. Keeps **top-4 final boards** of the current set and clusters them by *main carry + primary trait*.
4. Picks the **8 most-played clusters** (one per carry) and derives for each:
   - the late board, main carry/tank and their **core completed items** (most-built per unit),
   - **trait breakpoints** the late board actually reaches,
   - a **playstyle** (reroll / slow roll / fast 8 / fast 9) from carry cost, star level and player level,
   - **early (1–2 cost) and mid (3-cost) item holders**, chosen by shared traits with the carry,
     the same damage profile (AD vs AP, inferred from the items players build on each unit) and range,
   - frontline/backline positioning from attack range.
5. Validates everything (ids, recipes, breakpoints) and writes `src/data/comps.json` in the overlay's schema.

| Option | Default | Meaning |
|---|---|---|
| `--platform` / `--region` | `euw1` / `europe` | Riot routing values (e.g. `na1`/`americas`, `kr`/`asia`) |
| `--players` | `40` | Top-LP players to sample |
| `--matches-per-player` | `10` | Recent match ids per player |
| `--max-matches` | `200` | Cap on unique matches |
| `--days` | `7` | Only matches from the last N days |
| `--comps` | `8` | Comps to output |
| `--min-boards` | `6` | Minimum top-4 boards for a cluster to count |
| `--out` | `src/data/comps.json` | Output path |

Data sources: Riot API (matches), Data Dragon (ids, names, costs, items) and CommunityDragon
(traits, trait breakpoints, attack range — Data Dragon's TFT files don't include those).
Requires **Node ≥ 22.18**. Generated tips are templates — review them before publishing.

### Getting a free Riot Developer API key

1. Go to **https://developer.riotgames.com** and sign in with your Riot account.
2. Your **Development API Key** is shown on the dashboard. Copy it into `.env`:
   ```bash
   RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
3. Development keys **expire every 24 hours** — click *Regenerate API Key* on the dashboard when the script
   reports `401/403`.
4. Development keys are rate-limited (**20 requests / second, 100 requests / 2 minutes**). The script throttles
   itself to stay inside these limits; a default run takes a few minutes.
5. For a long-lived key, register your project on the developer portal (*Register Product* → Personal API Key).
   Public apps need an approved production key.

**Keep the key secret:** it lives only in `.env` (git-ignored) and is used only by the Node script.
Never prefix it with `VITE_` — every `VITE_*` variable is bundled into the shipped app.

## Riot policy notes

- No win rates or average-placement stats are displayed anywhere — comp tiers (S/A/B) are labels only.
- Augment data is never collected: the Overwolf `augments` feature is not registered, and the meta script
  ignores augments in match payloads.
- The overlay only shows information about the player's own game and what is visible in the lobby.

## Project layout

```
public/manifest.json         Overwolf manifest (windows, hotkey Alt+X, game events)
src/windows/                 background (no React), desktop, in_game entry points
src/services/                gepService + gepParser (live data), ddragonService, metaService, stateSync
src/utils/                   compMatcher (scoring), compReasons, boardLayout
src/data/                    comps.json, itemRecipes.ts, shopOdds.ts
src/components/              overlay UI (cards, hex board, coach, simulator)
scripts/fetch-riot-meta.mjs  Riot API → comps.json generator
```
