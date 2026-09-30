# Gomoku AI JEV

A browser-based Gomoku (five-in-a-row) game. The Worker searches the position and Jev chooses among the moves the search cannot separate. The site is an Astro app deployed to Cloudflare Workers.

**Live demo:** https://gomoku.games.interjc.net/

## Features

- **15×15 board** with canvas rendering (wooden board, gradient stones)
- **Player vs AI** — play as black or white
- **4 difficulty levels** — difficulty is how far ahead the AI looks and tactical depth:
  - Easy: no lookahead at all. Jev picks from nearby points described by the current position alone — no scores, no replies
  - Medium: a depth-2 search shortlists a dozen points, and Jev picks among them with the pattern score and the opponent's best answer
  - Hard: iterative deepening to 8 plies with threat extension, then Jev chooses among the near-equal candidates using the verified line behind each one, with a deeper second round when it is torn between the top two
  - Master: hard's deep search augmented with classical Gomoku tactics (four-threes, continuous fours / VCF, jump fours) and an opening book of the 26 canonical Gomoku openings (Flower moon, etc.)
- **Win detection** — horizontal, vertical, both diagonals, with winning stone line highlight
- **Undo** — rewind the last 2 moves (yours + AI's)
- **Move history** panel with algebraic notation
- **AI thinking indicator** with async rendering
- **English / Japanese / Chinese UI** with dropdown switcher (defaults to English)
- **Persistent preferences & shareable URLs** — language, theme, difficulty, and player side persist in `localStorage` and can be set via URL parameters (`?lang=`, `?theme=`, `?difficulty=`, `?color=`)
- **Dark / light theme**
- **Mobile-friendly** — touch support on canvas, responsive layout

## Configuration & API Keys

To enable Jev AI decision-making:

1. **Obtain an API Key**: Sign up at [https://api.typesafe.ai](https://api.typesafe.ai) to get your API key.
2. **Local Development**: Copy `.dev.vars.example` to `.dev.vars` (gitignored) and add your key:
   ```sh
   cp .dev.vars.example .dev.vars
   ```
   ```ini
   TYPESAFE_API_KEY=your_typesafe_api_key_here
   ```
3. **Production Deployment**: Store the key as a Cloudflare Worker secret:
   ```sh
   pnpm exec wrangler secret put TYPESAFE_API_KEY
   ```

> [!NOTE]
> If no API key is provided, or if the API call fails or times out, the game automatically falls back to the built-in depth-bounded search engine.

### Using Compatible Models & Custom Endpoints

If you want to use an alternative model or a custom proxy/gateway compatible with Jev, adjust the `vars` in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "TYPESAFE_BASE_URL": "https://api.typesafe.ai", // Base URL for the API endpoint
    "TYPESAFE_DEFAULT_MODEL": "jev-latest",        // Model identifier
    "JEV_MIN_CONFIDENCE": "0"                       // Confidence threshold (0 to 1)
  }
}
```

For local development, you can override these variables directly in your `.dev.vars` file:

```ini
# Optional overrides in .dev.vars
TYPESAFE_BASE_URL=https://your-custom-endpoint.com
TYPESAFE_DEFAULT_MODEL=your-compatible-model
JEV_MIN_CONFIDENCE=0
```

## Development

### Prerequisites

- **Node.js**: `>= 24.0.0` (required for native `node:test`)
- **pnpm**: Package manager

### Getting Started

1. **Install dependencies**:
   ```sh
   pnpm install
   ```

2. **Configure environment variables**:
   Copy `.dev.vars.example` to `.dev.vars` and add your `TYPESAFE_API_KEY` (see [Configuration & API Keys](#configuration--api-keys)).

3. **Start the local server**:
   ```sh
   pnpm run dev
   ```
   *(Alternatively, run `bash scripts/dev.sh`)*

   The dev server will start at `http://localhost:4321`.

4. **Run tests**:
   ```sh
   pnpm test
   ```
   *(Tests use Node.js built-in `node:test` runner).*

5. **Build and preview**:
   ```sh
   pnpm run build
   pnpm run preview
   ```

## Deploy

The production target is a Cloudflare Worker using `@astrojs/cloudflare` as the adapter entry. There are no KV, D1, or R2 bindings.

### Deploying with Wrangler CLI

1. **Log in to Cloudflare**:
   ```sh
   pnpm exec wrangler login
   ```

2. **Set the API secret** (first-time setup or when updating the key):
   ```sh
   pnpm exec wrangler secret put TYPESAFE_API_KEY
   ```

3. **Build and deploy**:
   ```sh
   pnpm run deploy
   ```
   *(Runs `astro build && wrangler deploy`).*

The Worker name is `gomoku-ai-jev`. On the first deployment, it will be available on your `*.workers.dev` subdomain. You can attach a custom domain in the Cloudflare dashboard under **Workers & Pages > Settings > Domains & Routes**.

### Cloudflare Workers Builds (CI/CD)

When using Git integration via Cloudflare Workers Builds:
- **Build command**: `pnpm run build`
- **Deploy command**: `pnpm exec wrangler deploy`
- **Secrets**: Add `TYPESAFE_API_KEY` as an encrypted secret under Worker **Settings > Variables and Secrets**.
- **Public variables**: Defined in `wrangler.jsonc` and deployed automatically.

## Jev

[Jev](https://docs.typesafe.ai/introduction) is TypeSafe's flagship System One model. It does not write a reply or search a game tree. A program sends the current facts as `state` and asks a typed question. Jev returns a structured answer the program can branch on.

Each turn sends Jev the board and the full move list in `history`. The question is one [Choice](https://docs.typesafe.ai/primitives/choice) over a **shortlist** of empty points, not every nearby cell. The shortlist is what makes the difficulty ladder:

| Level | Points offered | What each point carries |
|-------|----------------|-------------------------|
| Easy | 24 nearby | adjacency only: neighbouring stones, whether it touches the latest stone |
| Medium | top 12 by depth-2 search | pattern made, forcing threats, score after the opponent's best reply |
| Hard | the near-equal band, at most 8 | the above plus the verified `best_line`, `score_behind_best`, `searched_plies`, `wins_by_force`, `loses_by_force` |
| Master | the near-equal band, up to 12 | the above plus `classic` shape classification (fours, four-three, double-three), opening book match (`book_move`, `book_opening`), and opening context |

Medium, hard, and master also attach the original pattern weights: five 100000, open four 10000, closed four 1000, open three 1000, closed three 100, open two 100, with defense counted as `opponentScore × 1.1`.

Two things keep hard and master strong:
1. The **band** contains only the moves whose deep search scores sit within one closed three of the best (within 300 points or 20% margin), with forced losses dropped and a forced win played outright — so Jev decides what the search genuinely cannot, and can never pick a move the search knows to be worse.
2. The answer is read as a **distribution**: `probabilities` is blended 50/50 with the normalised search ranking rather than taking the single top label. A short, richly described list is also chosen far better than a wide one — in practice Jev reports about 0.9 confidence over a hard band of three, against about 0.45 over 24 bare points.

When Jev's confidence is under 0.6, or the blend leaves the top two within 0.1, hard and master re-search just those two points to 10 plies and ask again — a runoff on better information. That is at most two calls per turn.

An immediate five, or a block of the opponent's immediate five, is still played in code above easy. On Master, unambiguous classical winning tactics (continuous fours / VCF, four-threes) and jump-four blocks are played directly without asking Jev. If the request fails, the point is illegal, or it falls outside the band, the Worker returns its own search move.

The Worker calls `jev-latest` through the [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript). That alias currently resolves to `jev-1.13.0`. The API key stays in `.dev.vars` locally and in a Worker secret in production.

## How the AI Works

Each AI turn asks `POST /api/move` on the Worker.

1. **Rule & Tactical shortcuts**: Above easy, code plays an immediate five or blocks the opponent's immediate five. On Master, code also checks classical tactical shapes (continuous fours / VCF, four-threes, jump-four blocks) and plays them directly.
2. **Search**: The engine searches to the depth the level allows and ranks every candidate point. On Master in a recognized opening, the search restricts root moves to the recorded canonical branches.
3. **Jev Choice & Blending**: Jev chooses among the shortlist. On hard and master the pick is blended 50/50 with the search ranking, and an unsure answer triggers the deeper runoff round (10 plies).
4. **Fallback**: A missing key, a failed request, an illegal point, a pick outside the band, or confidence below `JEV_MIN_CONFIDENCE` falls back to the search's own best move, which the Worker already has in hand. The default threshold is `0`.

The page only searches for itself when the Worker is unreachable (offline fallback), and then at reduced limits (depth 6, 60 000 node budget on hard and master) — a full deep search does not belong on the browser's main thread.

### Board evaluation

The evaluation function scans every row, column, and diagonal for consecutive stones and scores each pattern:

| Pattern | Score |
|---------|-------|
| Five in a row | 100 000 (win) |
| Open four | 10 000 |
| Closed four | 1 000 |
| Open three | 1 000 |
| Closed three | 100 |
| Open two | 100 |

The final score is `ownScore - opponentScore × 1.1` (slightly defensive).

### Classical shapes and opening book (Master)

The alpha-beta evaluator evaluates runs of consecutive stones. To bridge tactical gaps that simple consecutive-run scoring misses until depth expands:
- **Sliding-window shapes**: A length-5 window directly identifies jump fours (`XX.XX`), four-threes, and double-threes.
- **Victory by Continuous Fours (VCF)**: A dedicated tactical search resolves forced winning four-sequences before calling minimax or Jev.
- **26 Canonical Gomoku Openings**: All 26 classical opening patterns (Direct openings like Flower Moon / 花月, Stream Moon / 溪月, etc., and Indirect openings like Po Moon / 浦月, Silver Moon / 银月, etc.) are recognized under all 8 symmetries (rotations and reflections). When an opening matches, the engine guides both root move selection and the state presented to Jev.

### The search

Alpha-beta over a fixed root perspective, so every score still reads as "good for the AI" the way the original minimax did. Four things buy the depth:

- **Incremental evaluation.** The search keeps a running pattern score per player. Placing a stone rescores only the four lines through that cell, so a leaf evaluation is a subtraction instead of a 225-cell board scan.
- **Cheap move ordering.** Candidates are ranked by what the point gains the mover and denies the opponent, measured locally around the cell. One walk per direction serves both players.
- **Narrowing width.** The root keeps 12 candidates for a trustworthy ranking; deeper plies keep 8, then 5, and beyond ply 1 only points adjacent to a stone.
- **Forced-move collapsing and threat extension.** When a five is available the node is cut to that single move, or to the points that must be occupied. A four or an open three extends the line past the nominal depth, which is what stops horizon blunders.

Depth is bounded by a **node budget**, not a clock: on Cloudflare Workers `Date.now()` does not advance during pure computation, so a time budget would never fire. Hard and Master reach 6–8 plies — considerably further along forcing lines — in roughly 300–450 ms.

Root moves are searched on a full window rather than a raised alpha. That costs pruning, but the point of the root pass is a trustworthy *ranking* for Jev to read, and alpha raising would turn every non-best score into an upper bound.

For reference, the previous depth-4 engine re-evaluated the whole board for every candidate at every node, and took 29–49 seconds per move on the same positions.

## Project Structure

```
gomoku-ai-jev/
├── astro.config.mjs    Astro config, output server, @astrojs/cloudflare
├── wrangler.jsonc      Cloudflare Worker configuration & public vars
├── .dev.vars.example   Example local development environment variables
├── src/
│   ├── pages/
│   │   ├── index.astro Page shell & early settings bootstrap
│   │   └── api/
│   │       └── move.js Server-side AI move endpoint (Cloudflare Worker)
│   ├── styles/
│   │   └── global.css  Layout, dark/light themes, responsive canvas
│   ├── scripts/
│   │   └── main.js     Client DOM, Canvas rendering, game loop & offline fallback
│   └── lib/
│       ├── gomoku.js   Board logic (immutable), win detection, nearby cells
│       ├── ai.js       Evaluation + iterative-deepening alpha-beta search
│       ├── classic.js  Classical shapes, four-three tactics, and VCF solver
│       ├── openings.js 26 canonical Gomoku opening records & symmetry mapping
│       ├── prefs.js    URL query parameters & localStorage preference handling
│       ├── i18n.js     English / Japanese / Chinese translations
│       └── jev/
│           ├── ask.js  TypeSafe SDK client wrapper & configuration
│           └── move.js Jev request builder, candidate shortlisting, and runoff
├── tests/
│   ├── gomoku.test.js  Board rules & win detection tests
│   ├── ai.test.js      Search depth, ordering, and tactics tests
│   ├── classic.test.js Classical tactics & opening recognition tests
│   ├── jev.test.js     Jev request builder, shortlist & runoff tests
│   ├── prefs.test.js   Settings URL/localStorage sync tests
│   └── i18n.test.js    Localization key completeness tests
└── assets/             Screenshots and media
```

## License

MIT


## Links

- 🌐 Demo: https://gomoku.games.interjc.net/
- 🔑 TypeSafe AI Platform: https://api.typesafe.ai
- 📖 TypeSafe Documentation: https://docs.typesafe.ai

