# Gomoku AI JEV

A browser-based Gomoku (five-in-a-row) game. Jev chooses the move on the Worker, and the page runs minimax when Jev does not return a cell. The site is an Astro app deployed to Cloudflare Workers.

**Live demo:** https://sen.ltd/portfolio/gomoku-ai/

## Features

- **15×15 board** with canvas rendering (wooden board, gradient stones)
- **Player vs AI** — play as black or white
- **3 difficulty levels**
  - Easy: Jev plays a beginner move next to the latest stone. If it returns no cell, the page picks a random nearby point
  - Medium: Jev uses the depth-2 pattern scores. The fallback search depth is 2
  - Hard: Jev uses the depth-4 evaluator, including the opponent's best reply. The fallback search depth is 4
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

Each turn sends Jev the board and the full move list in `history`. The question is one [Choice](https://docs.typesafe.ai/primitives/choice) over the empty points near existing stones. Easy, medium, and hard use different instructions. Medium and hard also attach the original pattern weights: five 100000, open four 10000, closed four 1000, open three 1000, closed three 100, open two 100, with defense counted as `opponentScore × 1.1`. Hard adds the opponent's best reply, the same one-ply look used to order the depth-4 search. An immediate five, or a block of the opponent's immediate five, is still played in code on medium and hard. If the request fails or the point is illegal, the page plays the old minimax move locally.

The Worker calls `jev-latest` through the [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript). That alias currently resolves to `jev-1.13.0`. The API key stays in `.dev.vars` locally and in a Worker secret in production.

## How the AI Works

Each AI turn asks `POST /api/move` on the Worker.

1. On medium and hard, code plays an immediate five, or blocks the opponent's immediate five.
2. Otherwise Jev chooses one empty point. The state includes every move so far. The question text follows the selected difficulty, and medium and hard candidates carry the pattern-evaluation notes.
3. A missing key, a failed request, an illegal point, or confidence below `JEV_MIN_CONFIDENCE` returns no cell. The page then runs `getAIMove()` in `src/lib/ai.js` at that difficulty. The default threshold is `0`. Raise it when you want uncertain picks to use minimax instead.

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

### Minimax with alpha-beta pruning

The AI only considers candidate moves **within radius 2 of any existing stone**, which keeps the branching factor small enough for depth-4 search to run in well under a second.

Move ordering (trying high-scoring moves first) further improves alpha-beta cutoffs, making the effective search roughly equivalent to depth 6–8 without ordering.

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
│       ├── ai.js       Minimax + alpha-beta pruning
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

<!-- sen-publish:links -->
## Links

- 🌐 Demo: https://sen.ltd/portfolio/gomoku-ai/
- 📝 dev.to: https://dev.to/sendotltd/a-gomoku-ai-with-minimax-alpha-beta-pruning-and-pattern-based-evaluation-4lai
<!-- /sen-publish:links -->
