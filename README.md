# Gomoku AI — 五目並べ AI

A browser-based Gomoku (five-in-a-row) game with an AI opponent powered by minimax search and alpha-beta pruning. The search runs in the page. The site is an Astro app deployed to Cloudflare Workers.

**Live demo:** https://sen.ltd/portfolio/gomoku-ai/

## Features

- **15×15 board** with canvas rendering (wooden board, gradient stones)
- **Player vs AI** — play as black or white
- **3 difficulty levels**
  - Easy: greedy random moves near existing stones
  - Medium: minimax depth 2
  - Hard: minimax depth 4 with alpha-beta pruning
- **Win detection** — horizontal, vertical, both diagonals
- **Undo** — rewind the last 2 moves (yours + AI's)
- **Move history** panel with algebraic notation
- **AI thinking indicator** with async rendering
- **Japanese / English UI** toggle
- **Dark / light theme**
- **Mobile-friendly** — touch support on canvas

## Development

```sh
npm install
npm run dev
```

Vite (via Astro) serves the app at http://localhost:4321.

```sh
npm test
npm run build
npm run preview
```

Tests use Node.js built-in `node:test` (Node 20+).

## Deploy

The production target is a Cloudflare Worker, using the same adapter entry as a typical Astro Workers app. There are no KV, D1, or R2 bindings. `npm run deploy` builds the site and uploads it with Wrangler.

```sh
npx wrangler login
npm run deploy
```

The Worker name is `gomoku-ai-jev`. The first deploy is available on your `workers.dev` subdomain. Attach a custom domain in the Cloudflare dashboard when you want one.

For Workers Builds, use build command `npm run build` and deploy command `npx wrangler deploy`.

## How the AI Works

`getAIMove()` in `src/lib/ai.js` runs in the browser after the player moves. Nothing is sent to a server. The Worker only serves the page and its assets.

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
│   │   └── index.astro Page shell
│   ├── styles/
│   │   └── global.css  Layout, dark/light themes
│   ├── scripts/
│   │   └── main.js     DOM, canvas, events
│   └── lib/
│       ├── gomoku.js   Board logic (immutable), win detection
│       ├── ai.js       Minimax + alpha-beta pruning
│       └── i18n.js     Japanese / English strings
├── tests/
│   ├── gomoku.test.js
│   └── ai.test.js
└── assets/             Screenshots and media
```

## License

MIT

<!-- sen-publish:links -->
## Links

- 🌐 Demo: https://sen.ltd/portfolio/gomoku-ai/
- 📝 dev.to: https://dev.to/sendotltd/a-gomoku-ai-with-minimax-alpha-beta-pruning-and-pattern-based-evaluation-4lai
<!-- /sen-publish:links -->
