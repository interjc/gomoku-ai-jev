# AGENTS.md — AI Agent Guidelines & Architecture Manual

This document is the authoritative guide for AI coding assistants and agents working on the `gomoku-ai-jev` codebase. It outlines core architectural invariants, the 4-tier hybrid decision pipeline, playing strength tuning methodologies, and strict performance/cost boundaries.

---

## 1. Project Invariants & Non-Negotiable Rules

When modifying or refactoring this repository, agents MUST respect the following invariants:

1. **Strict Gomoku Replay Validation (`src/lib/move-api.js`)**:
   - The server accepts only legal Gomoku games. It replays moves from an empty $15 \times 15$ board, enforcing Black-first alternating turns, integer bounds, unique coordinates, and exact parity with the supplied board.
   - Request bodies are strictly capped at **16 KiB**.
   - No arbitrary prompt injection, system instructions, or model overrides are accepted via the public API.
2. **Immutable Board Representation (`src/lib/gomoku.js`)**:
   - The board is represented as a $15 \times 15$ matrix of numbers (`0: EMPTY`, `1: BLACK`, `2: WHITE`).
   - Pure board helper functions must remain side-effect free. The search engine (`src/lib/ai.js`) maintains its own flat `Int8Array(225)` buffer with `makeMove` / `unmakeMove` for zero-allocation performance.
3. **No Raw Model IDs in Client UI (`src/components/Game.astro`, `src/scripts/main.js`)**:
   - Opponents must be displayed simply as `Clef`, `Clef Flash`, or `Jev`. Do not leak provider transport IDs (`@cf/cloudflare/clef-flash`, `typesafe/jev-1.14.0`) or internal API details to the user interface.
4. **Cloudflare Worker Compatibility (`@astrojs/cloudflare`)**:
   - The backend runs in a Cloudflare Worker environment.
   - **Crucial**: Node.js APIs (`fs`, `path`, native C++ bindings) are unavailable in production.
   - **Pure Compute Constraint**: `Date.now()` does NOT advance during synchronous CPU loops in Cloudflare Workers. Time-based search limits will never terminate. Search depth must be bounded strictly by **node budgets** (`nodeBudget`).

---

## 2. Decision Pipeline & Playing Strength Architecture

The AI plays Gomoku through a 4-tier hybrid architecture combining hardcoded tactics, an iterative-deepening alpha-beta search, candidate band pruning, and Workers AI System One model decisions:

```
[Game Request]
      │
      ▼
┌────────────────────────────────────────────────────────┐
│ Layer 0: Rule & Tactical Shortcuts (classic.js)        │
│ - Immediate 5-in-a-row (Win) & Opponent 5 (Block)     │
│ - Master: VCF (Continuous Fours), 4-3, Jump-4 blocks   │
│ - Master: 26 Canonical Gomoku Openings (花月, 浦月...) │
└─────────────────────────┬──────────────────────────────┘
                          │ (Unresolved)
                          ▼
┌────────────────────────────────────────────────────────┐
│ Layer 1: Heuristic Alpha-Beta Search (ai.js)           │
│ - Incremental 4-line pattern evaluation                │
│ - Move ordering by placement gains (own + opp * 0.9)   │
│ - Narrowing width per ply (W -> 0.6W -> 0.35W)         │
│ - Threat extensions (+1 ply on 4s and open 3s)         │
│ - Iterative deepening bounded by nodeBudget            │
└─────────────────────────┬──────────────────────────────┘
                          │ (Produces ranked list)
                          ▼
┌────────────────────────────────────────────────────────┐
│ Layer 2: Shortlist & Near-Equal Band (move.js)         │
│ - Filter out moves worse than: best - max(300, 20%)    │
│ - Discard forced losses; play forced wins directly    │
│ - Shortlist: Easy 24, Medium 12, Hard 8, Master 12    │
└─────────────────────────┬──────────────────────────────┘
                          │ (Near-equal candidates)
                          ▼
┌────────────────────────────────────────────────────────┐
│ Layer 3: System One Model Choice & Blend (move.js)     │
│ - Cloudflare Workers AI: Clef / Clef Flash / Jev       │
│ - Blending: 50% normalized search + 50% model prob     │
└─────────────────────────┬──────────────────────────────┘
                          │ (Torn: conf < 0.6 or gap < 0.1)
                          ▼
┌────────────────────────────────────────────────────────┐
│ Layer 4: Deep Runoff (move.js)                         │
│ - Re-search top 2 moves to Depth 10 with runoff budget │
│ - Second-round model choice with refreshed lines       │
└────────────────────────────────────────────────────────┘
```

---

## 3. Parameter Tuning Guide & Impact Analysis (棋力调参指南)

When tuning playing strength, agents must understand which file controls each parameter, how they interact, and their tactical effects:

### A. Search Engine Parameters (`src/lib/ai.js`, `src/lib/jev/move.js`)

1. **`PLAN_BUDGETS` (`src/lib/jev/move.js`)**:
   - `free: { search: 3_000, runoff: 1_500 }`
   - `paid: { search: 220_000, runoff: 160_000 }`
   - *Impact*: Controls maximum search nodes per move. Since each node takes $\approx 1.7\,\mu\text{s}$, Free plan CPU is $\approx 5\text{--}8\,\text{ms}$, while Paid plan CPU is $\approx 350\text{--}450\,\text{ms}$.
   - *Tuning Warning*: **NEVER set `PLAN_BUDGETS.free.search` above 4,000**. Cloudflare Free accounts strictly terminate requests exceeding 10 ms CPU with HTTP 503 (Error 1102).
2. **`maxDepth` (`src/lib/ai.js`, `LEVELS` in `move.js`)**:
   - Easy: 0 | Medium: 2 | Hard: 8 | Master: 8 | Runoff: 10
   - *Impact*: Upper ply boundary for iterative deepening. Hard/Master typically reaches 6–8 plies on Paid and 2–4 plies on Free before the node budget is exhausted.
3. **`width` (`widthFor(ply, width)` in `src/lib/ai.js`)**:
   - Default: 12 (Hard/Master), 14 (Medium).
   - *Dynamic Narrowing*: Ply $\le 1$ keeps $W$; Ply $2\text{--}3$ keeps $\lceil 0.6W \rceil$; Ply $\ge 4$ keeps $\lceil 0.35W \rceil$.
   - *Impact*: Narrowing width focuses node budget into deeper variations along the principal line. Widening reduces tactical blindness on distant flanks but consumes exponential node volume.
4. **`extensionLimit` (`src/lib/ai.js`)**:
   - Default: 8 (Hard/Master), 10 (Runoff), 0 (Medium).
   - *Impact*: When a candidate creates an open three or a four, depth is extended by $+1$. This eliminates **horizon blunders** (地平线效应) where imminent double-threats are missed just past the search horizon.
5. **Pattern Scoring & Defensive Multiplier (`scorePattern` in `src/lib/ai.js`)**:
   - Five: 100,000 | Open 4: 10,000 | Closed 4: 1,000 | Open 3: 1,000 | Closed 3: 100 | Open 2: 100
   - Evaluation formula: `ownScore - opponentScore * 1.1`
   - *Impact*: The `1.1` multiplier enforces slight defensive caution. Setting this $<1.0$ produces reckless attacking; $>1.3$ causes passive, submissive play.

### B. Hybrid Candidate Band & Shortlist (`src/lib/jev/move.js`)

1. **`band: { absolute: 300, relative: 0.2 }`**:
   - *Function*: Retains only moves within 300 points (less than a closed three) or 20% of the best move's score.
   - *Critical Guardrail*: Ensures the model only decides between moves that the deep search cannot tactically distinguish. If search identifies a clear winning line, `offered.length === 1` and the engine plays it without asking the model.
   - *Tuning*: Do not widen `band.absolute` beyond 500, or the model may pick tactical blunders.
2. **`shortlist`**:
   - Easy: 24 | Medium: 12 | Hard: 8 | Master: 12
   - *Impact*: Restricts the number of candidate objects serialized into `request.criteria`. LLM decision quality drops significantly when offered $>15$ choices.

### C. Blending & Runoff Thresholds (`src/lib/jev/move.js`)

1. **Weights (`SEARCH_WEIGHT = 0.5, JEV_WEIGHT = 0.5`)**:
   - Combined formula: `((entry.score - low) / span) * 0.5 + jev_prob * 0.5`.
   - *Impact*: Balances numerical alpha-beta accuracy with model intuition.
2. **`runoff: { confidence: 0.6, margin: 0.1 }`**:
   - Triggers when `model_confidence < 0.6` OR `top1_score - top2_score < 0.1`.
   - *Impact*: In volatile or ambiguous positions, narrows candidates to the top 2, performs a 10-ply search, and requests a second model decision (`rounds: 2`).

### D. Provider & Model Selection (`src/lib/workers-ai/ask.js`, `src/lib/jev/ask.js`)

- **Clef Flash (`@cf/cloudflare/clef-flash`)**: Used for Easy, Medium, and Hard. Extremely low latency (~100–250ms), minimal quota impact.
- **Clef Full (`@cf/cloudflare/clef`)**: Used for Master. Superior positional analysis over verified lines.
- **Jev (`typesafe/jev-1.14.0`)**: TypeSafe's System One model via Cloudflare AI Gateway.
- **`CLEF_TIMEOUT_MS`**: Defaults to 6000ms. If inference stalls, seamlessly falls back to the search engine's #1 move.

---

## 4. Performance, Cost & Runtime Boundaries

Agents must abide by these computational and financial limits:

| Dimension | Constraint | Engineering Formula & Threshold |
|---|---|---|
| **Free Plan CPU** | $\le 10\,\text{ms}$ per request | $\text{CPU} \approx \text{nodes} \times 1.7\,\mu\text{s} + 1.5\,\text{ms} \le 10\,\text{ms}$. Max nodes: 4,500. Exceeding throws Cloudflare 1102. |
| **Paid Plan CPU** | $\le 30\,\text{s}$ per request | $\text{CPU} \approx 220,000 \times 1.7\,\mu\text{s} \approx 374\,\text{ms}$. Highly safe. |
| **Model Prompt Size** | Keep payload under 16 KiB | $\text{Tokens} \approx 250 + (\text{history} \times 8) + (\text{candidates} \times 120)$. 8 candidates $\approx 1,200\text{--}1,500$ tokens. |
| **Runoff Call Multiplier** | 1 or 2 calls per turn | Runoff doubles inference latency and API credits. Default trigger rate is calibrated to $\approx 25\%$ of turns. |
| **Browser Offline Fallback** | Keep main thread smooth | `FALLBACK_LIMITS`: maxDepth 6, nodeBudget 60,000. Never run uncapped search on UI thread. |

---

## 5. Verification Checklist for Agents

Before concluding any work on AI, search, or tuning:

1. **Run full unit test suite**:
   ```sh
   node --test
   ```
2. **Verify specific test suites if touching search or providers**:
   ```sh
   node --test tests/ai.test.js tests/jev.test.js tests/move-api.test.js tests/providers.test.js
   ```
3. **Check Free-plan budget test**:
   Verify that `keeps a free-plan hard turn inside the free budgets` passes without timing out.
4. **Preserve Immature Cutoffs**:
   Never remove `if (nodes > nodeBudget * 0.45) break;` in `src/lib/ai.js`. Iterative deepening must not start a deeper ply if the current pass already consumed nearly half the budget.
