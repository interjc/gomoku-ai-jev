# Gomoku AI JEV

A browser-based Gomoku (five-in-a-row) game. The Worker searches the position and Jev chooses among the moves the search cannot separate. The site is an Astro app deployed to Cloudflare Workers.

**Live demo:** https://sen.ltd/portfolio/gomoku-ai/

## Features

- **15×15 board** with canvas rendering (wooden board, gradient stones)
- **Player vs AI** — play as black or white
- **3 difficulty levels** — difficulty is how far ahead the AI looks
  - Easy: no lookahead at all. Jev picks from nearby points described by the current position alone — no scores, no replies
  - Medium: a depth-2 search shortlists a dozen points, and Jev picks among them with the pattern score and the opponent's best answer
  - Hard: iterative deepening to 8 plies with threat extension, then Jev chooses among the near-equal candidates using the verified line behind each one, with a deeper second round when it is torn between the top two
- **Win detection** — horizontal, vertical, both diagonals
- **Undo** — rewind the last 2 moves (yours + AI's)
- **Move history** panel with algebraic notation
- **AI thinking indicator** with async rendering
- **English / Japanese / Chinese UI**. The header provides a click-to-open dropdown switcher for selecting languages. English is the default.
- **Dark / light theme**
- **Mobile-friendly** — touch support on canvas

## Development

```sh
bash scripts/dev.sh
```

That installs dependencies with pnpm and starts Astro at http://localhost:4321. `pnpm run dev` starts the server on its own.

```sh
pnpm test
pnpm run build
pnpm run preview
```

Tests use Node.js built-in `node:test` (Node 24+).

## Deploy

The production target is a Cloudflare Worker, using the same adapter entry as a typical Astro Workers app. There are no KV, D1, or R2 bindings. `pnpm run deploy` builds the site and uploads it with Wrangler.

```sh
pnpm exec wrangler login
pnpm run deploy
pnpm exec wrangler secret put TYPESAFE_API_KEY
```

Model URL, model name, and `JEV_MIN_CONFIDENCE` are public `vars` in `wrangler.jsonc`. The API key is not. For local development, put it in `.dev.vars` (gitignored):

```
TYPESAFE_API_KEY=your-local-key
```

The Worker name is `gomoku-ai-jev`. The first deploy is available on your `workers.dev` subdomain. Attach a custom domain in the Cloudflare dashboard when you want one.

For Workers Builds, use build command `pnpm run build` and deploy command `pnpm exec wrangler deploy`.

## Jev

[Jev](https://docs.typesafe.ai/introduction) is TypeSafe's flagship System One model. It does not write a reply or search a game tree. A program sends the current facts as `state` and asks a typed question. Jev returns a structured answer the program can branch on.

Each turn sends Jev the board and the full move list in `history`. The question is one [Choice](https://docs.typesafe.ai/primitives/choice) over a **shortlist** of empty points, not every nearby cell. The shortlist is what makes the difficulty ladder:

| Level | Points offered | What each point carries |
|-------|----------------|-------------------------|
| Easy | 24 nearby | adjacency only: neighbouring stones, whether it touches the latest stone |
| Medium | top 12 by depth-2 search | pattern made, forcing threats, score after the opponent's best reply |
| Hard | the near-equal band, at most 8 | the above plus the verified `best_line`, `score_behind_best`, `searched_plies`, `wins_by_force`, `loses_by_force` |

Medium and hard also attach the original pattern weights: five 100000, open four 10000, closed four 1000, open three 1000, closed three 100, open two 100, with defense counted as `opponentScore × 1.1`.

Two things keep hard strong. The **band** contains only the moves whose deep search scores sit within one closed three of the best, with forced losses dropped and a forced win played outright — so Jev decides what the search genuinely cannot, and can never pick a move the search knows to be worse. And the answer is read as a **distribution**: `probabilities` is blended with the normalised search ranking rather than taking the single top label. A short, richly described list is also chosen far better than a wide one — in practice Jev reports about 0.9 confidence over a hard band of three, against about 0.45 over 24 bare points.

When Jev's confidence is under 0.6, or the blend leaves the top two within 0.1, hard re-searches just those two points to 10 plies and asks again — a runoff on better information. That is at most two calls per turn.

An immediate five, or a block of the opponent's immediate five, is still played in code above easy. If the request fails, the point is illegal, or it falls outside the band, the Worker returns its own search move.

The Worker calls `jev-latest` through the [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript). That alias currently resolves to `jev-1.13.0`. The API key stays in `.dev.vars` locally and in a Worker secret in production.

## How the AI Works

Each AI turn asks `POST /api/move` on the Worker.

1. Above easy, code plays an immediate five, or blocks the opponent's immediate five.
2. The engine searches to the depth the level allows and ranks every candidate point.
3. Jev chooses among the shortlist. On hard the pick is blended with the search ranking, and an unsure answer triggers the deeper runoff round.
4. A missing key, a failed request, an illegal point, a pick outside the band, or confidence below `JEV_MIN_CONFIDENCE` falls back to the search's own best move, which the Worker already has in hand. The default threshold is `0`.

The page only searches for itself when the Worker is unreachable, and then at reduced limits — a full hard search does not belong on the browser's main thread.

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

### The search

Alpha-beta over a fixed root perspective, so every score still reads as "good for the AI" the way the original minimax did. Four things buy the depth:

- **Incremental evaluation.** The search keeps a running pattern score per player. Placing a stone rescores only the four lines through that cell, so a leaf evaluation is a subtraction instead of a 225-cell board scan.
- **Cheap move ordering.** Candidates are ranked by what the point gains the mover and denies the opponent, measured locally around the cell. One walk per direction serves both players.
- **Narrowing width.** The root keeps 12 candidates for a trustworthy ranking; deeper plies keep 8, then 5, and beyond ply 1 only points adjacent to a stone.
- **Forced-move collapsing and threat extension.** When a five is available the node is cut to that single move, or to the points that must be occupied. A four or an open three extends the line past the nominal depth, which is what stops horizon blunders.

Depth is bounded by a **node budget**, not a clock: on Cloudflare Workers `Date.now()` does not advance during pure computation, so a time budget would never fire. Hard reaches 6–8 plies — considerably further along forcing lines — in roughly 300–450 ms.

Root moves are searched on a full window rather than a raised alpha. That costs pruning, but the point of the root pass is a trustworthy *ranking* for Jev to read, and alpha raising would turn every non-best score into an upper bound.

For reference, the previous depth-4 engine re-evaluated the whole board for every candidate at every node, and took 29–49 seconds per move on the same positions.

## Project Structure

```
gomoku-ai-jev/
├── astro.config.mjs    Astro, output server, @astrojs/cloudflare
├── wrangler.jsonc      Worker name and static-asset binding
├── src/
│   ├── pages/
│   │   ├── index.astro Page shell
│   │   └── api/
│   │       └── move.js Jev move route
│   ├── styles/
│   │   └── global.css  Layout, dark/light themes
│   ├── scripts/
│   │   └── main.js     DOM, canvas, events
│   └── lib/
│       ├── gomoku.js   Board logic (immutable), win detection
│       ├── ai.js       Evaluation + iterative-deepening alpha-beta
│       ├── i18n.js     Japanese / English / Chinese strings
│       └── jev/        Choice request and server-side Jev call
├── tests/
│   ├── gomoku.test.js
│   ├── ai.test.js
│   ├── jev.test.js
│   └── i18n.test.js
└── assets/             Screenshots and media
```

## License

MIT


## Links

- 🌐 Demo: https://gomoku.games.interjc.net

