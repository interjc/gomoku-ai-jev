# Gomoku AI — Clef & Jev

A browser-based Gomoku (five-in-a-row) game. The Worker searches the position and Clef or Jev chooses among the moves the search cannot separate. Jev is the default opponent, and Hard is the default difficulty. The site is an Astro app deployed to Cloudflare Workers.

**Live demo:** https://gomoku.games.interjc.net/

## Features

- **15×15 board** with canvas rendering (wooden board, gradient stones)
- **Player vs AI** — play as black or white
- **Clef / Jev toggle in the title** — `/clef` and `/jev` identify the opponent; switching paths reloads the page and starts a new game
- **Compact opponent status** — the navbar shows the current model and difficulty; hover for details, or click/tap to open a modal with the model ID and search strength
- **4 difficulty levels** — difficulty is how far ahead the AI looks and tactical depth:
  - Easy: no lookahead at all. The model picks from nearby points described by the current position alone — no scores, no replies
  - Medium: a depth-2 search shortlists a dozen points, and the model picks among them with the pattern score and the opponent's best answer
  - Hard: iterative deepening to 8 plies with threat extension, then the model chooses among the near-equal candidates using the verified line behind each one, with a deeper second round when it is torn between the top two
  - Master: hard's deep search augmented with classical Gomoku tactics (four-threes, continuous fours / VCF, jump fours) and an opening book of the 26 canonical Gomoku openings (Flower moon, etc.)
- **Win detection** — horizontal, vertical, both diagonals, with winning stone line highlight
- **Undo** — rewind the last 2 moves (yours + AI's)
- **Move history** panel with algebraic notation
- **AI thinking indicator** with async rendering
- **English / Japanese / Chinese UI** with dropdown switcher (defaults to English)
- **Persistent preferences & shareable URLs** — language, theme, difficulty, and player side persist in `localStorage` and can be set via URL parameters (`?lang=`, `?theme=`, `?difficulty=`, `?color=`)
- **Dark / light theme**
- **Mobile-friendly** — touch support on canvas, responsive layout

## Providers & Configuration

Both providers are enabled by default. The deployment default is **Jev**, while **Hard** is the default difficulty for visitors without a saved or URL-specified difficulty. The title links to `/jev` and `/clef`. Choosing the other opponent performs a full navigation and starts a fresh game; difficulty, side, language, and theme retain their existing URL/localStorage behavior. Switching preserves query parameters and the hash. The provider itself is specified by the path, rather than a query parameter or localStorage.

The root `/` redirects to the configured default opponent. A disabled or unconfigured opponent redirects to the available default. If neither provider is available, `/` serves a local-engine game and disables both toggle options. Unknown opponent paths return 404. Pages read deployment configuration at request time and are not cached.

### Wrangler switches

```jsonc
{
  "ai": {
    "binding": "AI",
    "remote": true
  },
  "vars": {
    "AI_CLEF_ENABLED": "true",
    "AI_JEV_ENABLED": "true",
    "AI_DEFAULT_PROVIDER": "jev",
    "CLEF_MIN_CONFIDENCE": "0",
    "CLEF_TIMEOUT_MS": "6000",
    "TYPESAFE_BASE_URL": "https://api.typesafe.ai",
    "TYPESAFE_DEFAULT_MODEL": "jev-latest",
    "JEV_MIN_CONFIDENCE": "0"
  }
}
```

`AI_CLEF_ENABLED` and `AI_JEV_ENABLED` independently enable each opponent; set either to `"false"` to disable it. `AI_DEFAULT_PROVIDER` accepts `"jev"` or `"clef"`. A provider also needs its transport configured: the `AI` binding for Clef, or a `TYPESAFE_API_KEY` for Jev. If the configured default is unavailable, the available opponent becomes the default. Explicit move requests for an unknown, disabled, or unconfigured provider return HTTP 400.

### Clef through Workers AI

The [Workers AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/) calls the two [Clef models](https://developers.cloudflare.com/workers-ai/models/clef/) using the same System One decision format as Jev:

| Difficulty | Model ID | Request selector |
|------------|----------|------------------|
| Easy | `@cf/cloudflare/clef-flash` | `clef-flash` |
| Medium | `@cf/cloudflare/clef-flash` | `clef-flash` |
| Hard (default) | `@cf/cloudflare/clef` | `clef` |
| Master | `@cf/cloudflare/clef` | `clef` |

Both rounds of a hard/master decision use the same model. No TypeSafe key or separate Cloudflare inference key is needed for the AI binding. For development, log in with `pnpm exec wrangler login`. The Worker runs locally, but `remote: true` sends inference to Cloudflare; these calls consume real Workers AI usage. See [remote bindings](https://developers.cloudflare.com/workers/local-development/#remote-bindings) and [Clef Flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/).

`CLEF_MIN_CONFIDENCE` sets the acceptance floor (0–1). `CLEF_TIMEOUT_MS` bounds each model call, with no automatic retry. The timeout stops waiting for the result; it does not guarantee cancellation of inference already running remotely. On failure, timeout, or an invalid answer, the Worker uses its existing search fallback. A failed second round keeps the valid first-round decision. It does not automatically call the other provider.

### Jev API key and compatible endpoints

The existing Jev connector and all `TYPESAFE_*` / `JEV_MIN_CONFIDENCE` settings are unchanged.

1. Obtain a key from [TypeSafe](https://api.typesafe.ai).
2. For local development, copy `.dev.vars.example` to `.dev.vars` (gitignored), then uncomment and set:
   ```ini
   TYPESAFE_API_KEY=your_typesafe_api_key_here
   ```
3. For production, store the key as a Worker secret:
   ```sh
   pnpm exec wrangler secret put TYPESAFE_API_KEY
   ```

`TYPESAFE_BASE_URL` and `TYPESAFE_DEFAULT_MODEL` still support Jev-compatible custom endpoints and models. Local settings may override the public Wrangler variables in `.dev.vars`, for example:

```ini
AI_DEFAULT_PROVIDER=clef
# Optional custom Jev endpoint/model:
# TYPESAFE_BASE_URL=https://your-custom-endpoint.com
# TYPESAFE_DEFAULT_MODEL=your-compatible-model
# JEV_MIN_CONFIDENCE=0
```

With no Jev key, its title option is disabled and the default falls back to Clef. If a configured model call fails, the game continues with the built-in engine. The details modal explains unavailable options and describes the selected search profile; it is not an Elo rating or a guarantee that every turn requires a model call.

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
   Run `pnpm exec wrangler login` for remote Workers AI inference. To use the default Jev opponent, copy `.dev.vars.example` to `.dev.vars` and set `TYPESAFE_API_KEY` (see [Providers & Configuration](#providers--configuration)). Clef is available without a Jev key.

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

The production target is a Cloudflare Worker using `@astrojs/cloudflare` as the adapter entry. The Worker has a remote Workers AI binding and no KV, D1, or R2 bindings.

### Deploying with Wrangler CLI

1. **Log in to Cloudflare**:
   ```sh
   pnpm exec wrangler login
   ```

2. **Set the Jev API secret** (required for the default Jev opponent):
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
- **Secrets**: To enable Jev, add `TYPESAFE_API_KEY` as an encrypted secret under Worker **Settings > Variables and Secrets**.
- **Public variables**: Defined in `wrangler.jsonc` and deployed automatically.

## Model decisions

Clef and Jev share the same request builder, search shortlist, blending, and runoff. The provider adapter returns `{ choice, confidence, probabilities }`. Clef uses `env.AI.run()`; Jev uses the existing TypeSafe SDK.

[Jev](https://docs.typesafe.ai/introduction) is TypeSafe's flagship System One model. It does not write a reply or search a game tree. A program sends the current facts as `state` and asks a typed question. Jev returns a structured answer the program can branch on.

Each model decision sends the selected provider the board and the full move list in `history`. The question is one [Choice](https://docs.typesafe.ai/primitives/choice) over a **shortlist** of empty points, not every nearby cell. The shortlist is what makes the difficulty ladder:

| Level | Points offered | What each point carries |
|-------|----------------|-------------------------|
| Easy | 24 nearby | adjacency only: neighbouring stones, whether it touches the latest stone |
| Medium | top 12 by depth-2 search | pattern made, forcing threats, score after the opponent's best reply |
| Hard | the near-equal band, at most 8 | the above plus the verified `best_line`, `score_behind_best`, `searched_plies`, `wins_by_force`, `loses_by_force` |
| Master | the near-equal band, up to 12 | the above plus `classic` shape classification (fours, four-three, double-three), opening book match (`book_move`, `book_opening`), and opening context |

Medium, hard, and master also attach the original pattern weights: five 100000, open four 10000, closed four 1000, open three 1000, closed three 100, open two 100, with defense counted as `opponentScore × 1.1`.

Two things keep hard and master strong:
1. The **band** contains only the moves whose deep search scores sit within one closed three of the best (within 300 points or 20% margin), with forced losses dropped and a forced win played outright — so the model selects only within the search’s near-equal band.
2. The answer is read as a **distribution**: `probabilities` is blended 50/50 with the normalised search ranking rather than taking the single top label. The same blending rules apply to both providers; model confidence is not a measure of chess strength.

When the model's confidence is under 0.6, or the blend leaves the top two within 0.1, hard and master re-search just those two points to 10 plies and ask again — a runoff on better information. That is at most two calls per turn.

An immediate five, or a block of the opponent's immediate five, is still played in code above easy. On Master, unambiguous classical winning tactics (continuous fours / VCF, four-threes) and jump-four blocks are played directly without asking the model. If the request fails, the point is illegal, or it falls outside the band, the Worker returns its own search move.

The Worker calls `jev-latest` through the [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript). The API key stays in `.dev.vars` locally and in a Worker secret in production.

## How the AI Works

Each model-backed AI turn asks `POST /api/move` on the Worker with an explicit `provider` (`clef` or `jev`), the board, player, difficulty, and history. Responses retain row/column, confidence, depth, and rounds, and include the selected `provider` and actual `model` ID when a model supplied the decision. `source` distinguishes `clef`, `jev`, `search`, `rule`, `classic`, and `local`.

1. **Rule & Tactical shortcuts**: Above easy, code plays an immediate five or blocks the opponent's immediate five. On Master, code also checks classical tactical shapes (continuous fours / VCF, four-threes, jump-four blocks) and plays them directly.
2. **Search**: The engine searches to the depth the level allows and ranks every candidate point. On Master in a recognized opening, the search restricts root moves to the recorded canonical branches.
3. **Model Choice & Blending**: The selected model chooses among the shortlist. On hard and master the pick is blended 50/50 with the search ranking, and an unsure answer triggers the deeper runoff round (10 plies).
4. **Fallback**: A failed request, an illegal point, a pick outside the band, or confidence below the provider’s configured acceptance floor falls back to the search's own best move, which the Worker already has in hand. The default threshold is `0`.

The page searches for itself when the Worker is unreachable (offline fallback), or when neither provider is available, and then at reduced limits (depth 6, 60 000 node budget on hard and master) — a full deep search does not belong on the browser's main thread.

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
- **Victory by Continuous Fours (VCF)**: A dedicated tactical search resolves forced winning four-sequences before calling minimax or the model.
- **26 Canonical Gomoku Openings**: All 26 classical opening patterns (Direct openings like Flower Moon / 花月, Stream Moon / 溪月, etc., and Indirect openings like Po Moon / 浦月, Silver Moon / 银月, etc.) are recognized under all 8 symmetries (rotations and reflections). When an opening matches, the engine guides both root move selection and the state presented to the model.

### The search

Alpha-beta over a fixed root perspective, so every score still reads as "good for the AI" the way the original minimax did. Four things buy the depth:

- **Incremental evaluation.** The search keeps a running pattern score per player. Placing a stone rescores only the four lines through that cell, so a leaf evaluation is a subtraction instead of a 225-cell board scan.
- **Cheap move ordering.** Candidates are ranked by what the point gains the mover and denies the opponent, measured locally around the cell. One walk per direction serves both players.
- **Narrowing width.** The root keeps 12 candidates for a trustworthy ranking; deeper plies keep 8, then 5, and beyond ply 1 only points adjacent to a stone.
- **Forced-move collapsing and threat extension.** When a five is available the node is cut to that single move, or to the points that must be occupied. A four or an open three extends the line past the nominal depth, which is what stops horizon blunders.

Depth is bounded by a **node budget**, not a clock: on Cloudflare Workers `Date.now()` does not advance during pure computation, so a time budget would never fire. Hard and Master reach 6–8 plies — considerably further along forcing lines — in roughly 300–450 ms.

Root moves are searched on a full window rather than a raised alpha. That costs pruning, but the point of the root pass is a trustworthy *ranking* for the model to read, and alpha raising would turn every non-best score into an upper bound.

For reference, the previous depth-4 engine re-evaluated the whole board for every candidate at every node, and took 29–49 seconds per move on the same positions.

## Project Structure

```
gomoku-ai-jev/
├── astro.config.mjs    Astro config, output server, @astrojs/cloudflare
├── wrangler.jsonc      AI binding, provider switches & public vars
├── .dev.vars.example   Example local development environment variables
├── src/
│   ├── middleware.js   Disable caching for opponent pages and redirects
│   ├── components/
│   │   └── Game.astro   Shared page, opponent toggle & details dialog
│   ├── pages/
│   │   ├── index.astro Root redirect, or local-only game
│   │   ├── [provider].astro Runtime /clef and /jev routes
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
│       ├── providers.js Provider configuration & transport selection
│       ├── provider-choice.js Provider IDs & availability resolution
│       ├── workers-ai/
│       │   └── ask.js  Clef model mapping, AI binding, validation & timeout
│       ├── prefs.js    URL query parameters & localStorage preference handling
│       ├── i18n.js     English / Japanese / Chinese translations
│       └── jev/
│           ├── ask.js  TypeSafe SDK client wrapper & configuration
│           └── move.js Shared request builder, candidate shortlisting & runoff
├── tests/
│   ├── gomoku.test.js  Board rules & win detection tests
│   ├── ai.test.js      Search depth, ordering, and tactics tests
│   ├── classic.test.js Classical tactics & opening recognition tests
│   ├── jev.test.js     Jev request builder, shortlist & runoff tests
│   ├── providers.test.js Provider switches, model transport & fallback tests
│   ├── prefs.test.js   Settings URL/localStorage sync tests
│   └── i18n.test.js    Localization key completeness tests
└── assets/             Screenshots and media
```

## License

MIT


## Links

- 🌐 Demo: https://gomoku.games.interjc.net/
- 🔑 TypeSafe AI Platform: https://api.typesafe.ai
- ☁️ [Cloudflare Clef](https://developers.cloudflare.com/workers-ai/models/clef/) / [Clef Flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/)
- 📖 TypeSafe Documentation: https://docs.typesafe.ai
