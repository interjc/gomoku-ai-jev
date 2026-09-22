/**
 * ai.js — Gomoku engine: pattern evaluation + iterative-deepening alpha-beta
 *
 * Difficulty is how far ahead the engine looks:
 *   easy   — no search at all, only the current position
 *   medium — depth 2, the original medium setting
 *   hard   — iterative deepening to depth 8 with threat extension
 *
 * The search keeps a mutable flat board plus a running pattern score per
 * player. Placing a stone only rescores the four lines through that cell, so a
 * leaf evaluation is a subtraction instead of a board scan. Depth is bounded by
 * a node budget, not a clock: on Cloudflare Workers `Date.now()` does not
 * advance during pure computation, so a time budget would never fire.
 */

import {
  BOARD_SIZE, EMPTY, BLACK, WHITE,
  getNearbyCells,
} from './gomoku.js';

const N = BOARD_SIZE;
const CELL_COUNT = N * N;
const CENTER = Math.floor(N / 2);
const OPPONENT = { [BLACK]: WHITE, [WHITE]: BLACK };

/** A five in a row. Plies are subtracted so a faster win scores higher. */
export const WIN_SCORE = 10_000_000;

/** Radius around existing stones that the engine considers at all. */
const RADIUS = 2;

const DR = [0, 1, 1, 1];
const DC = [1, 0, 1, -1];

// ── Difficulty profiles ───────────────────────────────────────────────────────

/**
 * `maxDepth` 0 means no lookahead. `width` is how many candidate points a node
 * keeps after ordering. `extensionLimit` is how many extra plies one line may
 * spend following forced threats.
 */
export const DIFFICULTY = {
  easy:   { maxDepth: 0, width: 0,  nodeBudget: 0,       extensionLimit: 0, forced: false },
  medium: { maxDepth: 2, width: 12, nodeBudget: 40_000,  extensionLimit: 0, forced: true  },
  hard:   { maxDepth: 8, width: 12, nodeBudget: 220_000, extensionLimit: 8, forced: true  },
};

export function difficultyProfile(difficulty, overrides = {}) {
  return { ...(DIFFICULTY[difficulty] ?? DIFFICULTY.hard), ...overrides };
}

// ── Pattern scoring ───────────────────────────────────────────────────────────

/**
 * Score a run of `count` consecutive stones with `openEnds` open ends.
 * These are the original weights; the whole engine is calibrated to them.
 */
export function scorePattern(count, openEnds) {
  if (count >= 5) return 100000;
  if (openEnds === 0) {
    // Closed — worth much less
    if (count === 4) return 100;
    if (count === 3) return 10;
    if (count === 2) return 2;
    return 1;
  }
  if (openEnds === 1) {
    if (count === 4) return 1000;
    if (count === 3) return 100;
    if (count === 2) return 10;
    return 2;
  }
  // openEnds === 2
  if (count === 4) return 10000;
  if (count === 3) return 1000;
  if (count === 2) return 100;
  return 5;
}

function inBounds(row, col) {
  return row >= 0 && row < N && col >= 0 && col < N;
}

// ── Line scanning ─────────────────────────────────────────────────────────────

// `scanLine` reports both players in one walk, through these two slots.
let lineBlack = 0;
let lineWhite = 0;

/**
 * Score every run on the whole line through (row, col) in direction d, for both
 * players at once, leaving the totals in `lineBlack` / `lineWhite`.
 */
function scanLine(cells, row, col, dr, dc) {
  let sr = row;
  let sc = col;
  while (inBounds(sr - dr, sc - dc)) { sr -= dr; sc -= dc; }

  lineBlack = 0;
  lineWhite = 0;

  let prev = -1;          // -1 off board, otherwise the cell value
  let runPlayer = EMPTY;
  let run = 0;
  let openBefore = 0;
  let r = sr;
  let c = sc;

  while (inBounds(r, c)) {
    const value = cells[r * N + c];
    if (runPlayer !== EMPTY && value !== runPlayer) {
      const points = scorePattern(run, openBefore + (value === EMPTY ? 1 : 0));
      if (runPlayer === BLACK) lineBlack += points; else lineWhite += points;
      runPlayer = EMPTY;
      run = 0;
    }
    if (value !== EMPTY) {
      if (runPlayer === EMPTY) {
        runPlayer = value;
        run = 1;
        openBefore = prev === EMPTY ? 1 : 0;
      } else {
        run += 1;
      }
    }
    prev = value;
    r += dr;
    c += dc;
  }

  if (runPlayer !== EMPTY) {
    // The line ran off the board, so the far end is closed.
    const points = scorePattern(run, openBefore);
    if (runPlayer === BLACK) lineBlack += points; else lineWhite += points;
  }
}

/** Total pattern score for both players over the whole board. */
function fullScores(cells) {
  let black = 0;
  let white = 0;
  for (let d = 0; d < 4; d++) {
    const dr = DR[d];
    const dc = DC[d];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (inBounds(r - dr, c - dc)) continue;   // not the start of a line
        scanLine(cells, r, c, dr, dc);
        black += lineBlack;
        white += lineWhite;
      }
    }
  }
  return [black, white];
}

/** The longest run through (row, col) for `player`, with its open ends. */
function bestRunAt(cells, row, col, player) {
  let bestCount = 0;
  let bestOpen = 0;
  for (let d = 0; d < 4; d++) {
    const dr = DR[d];
    const dc = DC[d];
    let count = 1;
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c) && cells[r * N + c] === player) { count += 1; r += dr; c += dc; }
    const openAfter = inBounds(r, c) && cells[r * N + c] === EMPTY ? 1 : 0;
    r = row - dr;
    c = col - dc;
    while (inBounds(r, c) && cells[r * N + c] === player) { count += 1; r -= dr; c -= dc; }
    const openBefore = inBounds(r, c) && cells[r * N + c] === EMPTY ? 1 : 0;
    const openEnds = openAfter + openBefore;
    if (count > bestCount || (count === bestCount && openEnds > bestOpen)) {
      bestCount = count;
      bestOpen = openEnds;
    }
  }
  return { count: bestCount, openEnds: bestOpen };
}

// `placementGains` reports both players through these two slots.
let gainOwn = 0;
let gainAgainst = 0;

/**
 * What each side would gain in pattern score by taking (row, col).
 *
 * One walk per direction serves both players: the first stone it meets decides
 * whose run the point extends, and blocks the other side's run at that end.
 * Move ordering runs this on every empty candidate of every node, so sharing
 * the walk rather than scanning twice is worth the bookkeeping.
 */
function placementGains(cells, row, col, player, opponent) {
  gainOwn = 0;
  gainAgainst = 0;

  for (let d = 0; d < 4; d++) {
    const dr = DR[d];
    const dc = DC[d];
    let ownRun = 1;
    let againstRun = 1;
    let ownOpen = 0;
    let againstOpen = 0;

    // Both ends of the line, one walk each.
    for (let side = 0; side < 2; side++) {
      const sr = side === 0 ? dr : -dr;
      const sc = side === 0 ? dc : -dc;
      let r = row + sr;
      let c = col + sc;
      if (!inBounds(r, c)) continue;                 // off board: closed for both
      const first = cells[r * N + c];
      if (first === EMPTY) {
        ownOpen += 1;
        againstOpen += 1;
        continue;
      }
      let count = 0;
      while (inBounds(r, c) && cells[r * N + c] === first) { count += 1; r += sr; c += sc; }
      const open = inBounds(r, c) && cells[r * N + c] === EMPTY ? 1 : 0;
      if (first === player) {
        ownRun += count;
        ownOpen += open;
      } else {
        againstRun += count;
        againstOpen += open;
      }
    }

    gainOwn += scorePattern(ownRun, ownOpen);
    gainAgainst += scorePattern(againstRun, againstOpen);
  }
}

/** What `player` alone would gain by taking (row, col). */
function placementGain(cells, row, col, player) {
  placementGains(cells, row, col, player, OPPONENT[player]);
  return gainOwn;
}

// ── Public board helpers ──────────────────────────────────────────────────────

function toCells(board) {
  const cells = new Int8Array(CELL_COUNT);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) cells[r * N + c] = board[r][c];
  }
  return cells;
}

/**
 * Board evaluation from `player`'s perspective: own patterns minus the
 * opponent's, weighted 1.1 so the engine leans slightly defensive.
 */
export function evaluateBoard(board, player) {
  const [black, white] = fullScores(toCells(board));
  const own = player === BLACK ? black : white;
  const other = player === BLACK ? white : black;
  return own - other * 1.1;
}

/** A point that completes five for `player`, or null. */
export function findWinningMove(board, player) {
  const cells = toCells(board);
  for (const [row, col] of getNearbyCells(board, 1)) {
    if (cells[row * N + col] !== EMPTY) continue;
    cells[row * N + col] = player;
    const wins = bestRunAt(cells, row, col, player).count >= 5;
    cells[row * N + col] = EMPTY;
    if (wins) return [row, col];
  }
  return null;
}

/**
 * The pattern a point would create for `player`, plus any forcing threats it
 * carries. Used to describe candidate points without running a search.
 */
export function describePlacement(board, player, row, col) {
  const cells = toCells(board);
  cells[row * N + col] = player;
  const names = [];
  for (let d = 0; d < 4; d++) {
    const run = runInDirection(cells, row, col, player, DR[d], DC[d]);
    names.push({ direction: DIRECTION_NAMES[d], ...run });
  }
  cells[row * N + col] = EMPTY;

  let best = 'none';
  const forcing = [];
  for (const entry of names) {
    const pattern = patternName(entry.count, entry.openEnds);
    if (PATTERN_RANK[pattern] > PATTERN_RANK[best]) best = pattern;
    if (pattern === 'open four' || pattern === 'closed four' || pattern === 'open three') {
      forcing.push(`${pattern} ${entry.direction}`);
    }
  }
  return { pattern: best, forcing };
}

const DIRECTION_NAMES = ['horizontal', 'vertical', 'down-diagonal', 'up-diagonal'];

const PATTERN_RANK = {
  five: 7,
  'open four': 6,
  'closed four': 5,
  'open three': 4,
  'closed three': 3,
  'open two': 2,
  none: 0,
};

function patternName(count, openEnds) {
  if (count >= 5) return 'five';
  if (count === 4 && openEnds === 2) return 'open four';
  if (count === 4 && openEnds === 1) return 'closed four';
  if (count === 3 && openEnds === 2) return 'open three';
  if (count === 3 && openEnds === 1) return 'closed three';
  if (count === 2 && openEnds === 2) return 'open two';
  return 'none';
}

function runInDirection(cells, row, col, player, dr, dc) {
  let count = 1;
  let r = row + dr;
  let c = col + dc;
  while (inBounds(r, c) && cells[r * N + c] === player) { count += 1; r += dr; c += dc; }
  const openAfter = inBounds(r, c) && cells[r * N + c] === EMPTY ? 1 : 0;
  r = row - dr;
  c = col - dc;
  while (inBounds(r, c) && cells[r * N + c] === player) { count += 1; r -= dr; c -= dc; }
  const openBefore = inBounds(r, c) && cells[r * N + c] === EMPTY ? 1 : 0;
  return { count, openEnds: openAfter + openBefore };
}

// ── Search state ──────────────────────────────────────────────────────────────

const cells = new Int8Array(CELL_COUNT);
const touch = new Int16Array(CELL_COUNT);    // stones within RADIUS of each cell
const touchNear = new Int16Array(CELL_COUNT); // stones directly adjacent
let scoreBlack = 0;
let scoreWhite = 0;
let nodes = 0;
let nodeBudget = 0;
let aborted = false;

/** Per-ply move buffers, so move generation allocates nothing in the hot loop. */
const moveBuffers = [];
function moveBuffer(ply, width) {
  let buffer = moveBuffers[ply];
  if (!buffer || buffer.idx.length < width) {
    buffer = { idx: new Int16Array(width), score: new Float64Array(width), length: 0 };
    moveBuffers[ply] = buffer;
  }
  return buffer;
}

function bumpTouch(row, col, delta) {
  const r0 = Math.max(0, row - RADIUS);
  const r1 = Math.min(N - 1, row + RADIUS);
  const c0 = Math.max(0, col - RADIUS);
  const c1 = Math.min(N - 1, col + RADIUS);
  for (let r = r0; r <= r1; r++) {
    const base = r * N;
    const adjacentRow = r >= row - 1 && r <= row + 1;
    for (let c = c0; c <= c1; c++) {
      touch[base + c] += delta;
      if (adjacentRow && c >= col - 1 && c <= col + 1) touchNear[base + c] += delta;
    }
  }
}

function lineTotals(row, col, sign) {
  for (let d = 0; d < 4; d++) {
    scanLine(cells, row, col, DR[d], DC[d]);
    scoreBlack += sign * lineBlack;
    scoreWhite += sign * lineWhite;
  }
}

function makeMove(index, player) {
  const row = (index / N) | 0;
  const col = index % N;
  lineTotals(row, col, -1);
  cells[index] = player;
  lineTotals(row, col, 1);
  bumpTouch(row, col, 1);
}

function unmakeMove(index) {
  const row = (index / N) | 0;
  const col = index % N;
  lineTotals(row, col, -1);
  cells[index] = EMPTY;
  lineTotals(row, col, 1);
  bumpTouch(row, col, -1);
}

function staticScore(root) {
  const own = root === BLACK ? scoreBlack : scoreWhite;
  const other = root === BLACK ? scoreWhite : scoreBlack;
  return own - other * 1.1;
}

/** Five in a row is the only pattern worth this much, so it doubles as a flag. */
const FIVE = 100000;

/**
 * How many candidates a node keeps. The root needs a broad, trustworthy list;
 * deeper plies only need the handful that could change the verdict, and that
 * narrowing is what buys the extra depth.
 */
function widthFor(ply, width) {
  if (ply <= 1) return width;
  if (ply <= 3) return Math.max(4, Math.ceil(width * 0.6));
  return Math.max(3, Math.ceil(width * 0.35));
}

/**
 * Order candidate points by what they gain the mover and deny the opponent,
 * then keep the best few. Insertion into a fixed buffer beats sorting the whole
 * list, and the buffer is reused across nodes at the same ply.
 *
 * A five on the board ends the game, so when one is available the reply is
 * forced: take the win, or occupy the points that would give it away. Cutting
 * the node down to those moves is what keeps long forcing sequences cheap.
 */
function generateMoves(ply, player, width) {
  const opponent = OPPONENT[player];
  const near = ply < 2 ? touch : touchNear;
  const limit = widthFor(ply, width);
  const buffer = moveBuffer(ply, Math.max(limit, 8));
  const { idx, score } = buffer;
  let length = 0;
  let winning = -1;
  let blocks = null;

  for (let index = 0; index < CELL_COUNT; index++) {
    if (cells[index] !== EMPTY || near[index] === 0) continue;
    const row = (index / N) | 0;
    const col = index % N;

    placementGains(cells, row, col, player, opponent);
    const own = gainOwn;
    const against = gainAgainst;
    if (own >= FIVE) { winning = index; break; }
    if (against >= FIVE) {
      if (blocks === null) blocks = [];
      blocks.push(index);
      continue;
    }

    const value = own + against * 0.9;
    if (length < limit) {
      let i = length++;
      while (i > 0 && score[i - 1] < value) { score[i] = score[i - 1]; idx[i] = idx[i - 1]; i -= 1; }
      score[i] = value;
      idx[i] = index;
    } else if (value > score[limit - 1]) {
      let i = limit - 1;
      while (i > 0 && score[i - 1] < value) { score[i] = score[i - 1]; idx[i] = idx[i - 1]; i -= 1; }
      score[i] = value;
      idx[i] = index;
    }
  }

  if (winning >= 0) {
    idx[0] = winning;
    buffer.length = 1;
    return buffer;
  }
  if (blocks !== null) {
    const count = Math.min(blocks.length, idx.length);
    for (let i = 0; i < count; i++) idx[i] = blocks[i];
    buffer.length = count;
    return buffer;
  }

  buffer.length = length;
  return buffer;
}

const PV_LIMIT = 10;
const PV_PLY_LIMIT = 6;

/**
 * Alpha-beta over a fixed root perspective, so every score reads as "good for
 * the AI" the way the original minimax did.
 */
function alphaBeta(depth, alpha, beta, side, root, ply, extLeft, width, pvOut) {
  nodes += 1;
  if (nodes > nodeBudget) {
    aborted = true;
    return staticScore(root);
  }
  if (depth <= 0) return staticScore(root);

  const buffer = generateMoves(ply, side, width);
  if (buffer.length === 0) return staticScore(root);

  const isMax = side === root;
  const collect = pvOut !== null && ply < PV_PLY_LIMIT;
  let best = isMax ? -Infinity : Infinity;

  for (let m = 0; m < buffer.length; m++) {
    const index = buffer.idx[m];
    const row = (index / N) | 0;
    const col = index % N;

    makeMove(index, side);
    const run = bestRunAt(cells, row, col, side);

    let score;
    let line = null;
    if (run.count >= 5) {
      score = isMax ? WIN_SCORE - ply : -(WIN_SCORE - ply);
    } else {
      // A four must be answered, and so must an open three. Following those
      // replies past the nominal depth is what stops horizon blunders.
      const forcing = run.count >= 4 || (run.count === 3 && run.openEnds === 2);
      const extend = forcing && extLeft > 0 ? 1 : 0;
      line = collect ? [] : null;
      score = alphaBeta(
        depth - 1 + extend, alpha, beta,
        OPPONENT[side], root, ply + 1, extLeft - extend, width, line,
      );
    }
    unmakeMove(index);

    const improved = isMax ? score > best : score < best;
    if (improved) {
      best = score;
      if (collect) {
        pvOut.length = 0;
        pvOut.push(index);
        if (line) {
          for (let i = 0; i < line.length && pvOut.length < PV_LIMIT; i++) pvOut.push(line[i]);
        }
      }
    }
    if (isMax) {
      if (best > alpha) alpha = best;
    } else if (best < beta) {
      beta = best;
    }
    if (beta <= alpha) break;
    if (aborted) break;
  }
  return best;
}

// ── Root search ───────────────────────────────────────────────────────────────

function toPoints(indices) {
  return indices.map(index => [(index / N) | 0, index % N]);
}

/**
 * Iterative deepening from the root.
 *
 * Root moves get a full window rather than a raised alpha: the point of this
 * function is a trustworthy *ranking* of the candidates, which Jev then reads,
 * and alpha raising would turn every non-best score into an upper bound.
 *
 * @returns {{row: number|null, col: number|null, score: number, depth: number,
 *            nodes: number, ranked: Array<{row: number, col: number,
 *            score: number, line: Array<[number, number]>}>}}
 */
export function searchMove(board, player, options = {}) {
  const cfg = { ...DIFFICULTY.hard, ...options };
  const empty = { row: null, col: null, score: 0, depth: 0, nodes: 0, ranked: [] };

  const source = toCells(board);
  cells.set(source);
  touch.fill(0);
  touchNear.fill(0);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (cells[r * N + c] !== EMPTY) bumpTouch(r, c, 1);
    }
  }
  [scoreBlack, scoreWhite] = fullScores(cells);

  nodes = 0;
  nodeBudget = Math.max(1, cfg.nodeBudget);
  aborted = false;

  const opponent = OPPONENT[player];
  let order;
  if (Array.isArray(cfg.rootMoves) && cfg.rootMoves.length > 0) {
    // A caller narrowing the root to specific points — used to verify a
    // shortlist more deeply than a full-width pass could afford.
    order = cfg.rootMoves
      .filter(([r, c]) => inBounds(r, c) && cells[r * N + c] === EMPTY)
      .map(([r, c]) => r * N + c);
  } else {
    const first = generateMoves(0, player, Math.max(1, cfg.width));
    order = Array.from(first.idx.slice(0, first.length));
  }
  if (order.length === 0) return empty;

  let completed = null;

  for (let depth = 2; depth <= Math.max(2, cfg.maxDepth); depth += 2) {
    aborted = false;
    const results = [];

    for (const index of order) {
      const row = (index / N) | 0;
      const col = index % N;
      makeMove(index, player);
      let score;
      let line = [];
      if (bestRunAt(cells, row, col, player).count >= 5) {
        score = WIN_SCORE;
      } else {
        score = alphaBeta(
          depth - 1, -Infinity, Infinity,
          opponent, player, 1, cfg.extensionLimit, cfg.width, line,
        );
      }
      unmakeMove(index);
      results.push({ row, col, score, line: [[row, col], ...toPoints(line)] });
      if (aborted) break;
    }

    if (!aborted || completed === null) {
      results.sort((a, b) => b.score - a.score);
      completed = { depth, results };
      order = results.map(r => r.row * N + r.col);
    }
    if (aborted) break;
    if (Math.abs(completed.results[0].score) >= WIN_SCORE / 2) break;
    // A deeper pass costs several times this one; do not start what cannot finish.
    if (nodes > nodeBudget * 0.45) break;
  }

  if (!completed || completed.results.length === 0) return empty;
  const top = completed.results[0];
  return {
    row: top.row,
    col: top.col,
    score: top.score,
    depth: completed.depth,
    nodes,
    ranked: completed.results,
  };
}

/**
 * Public entry point. Returns [row, col] for the AI's next move.
 *
 * `overrides` tunes the profile — the browser fallback path uses it to keep a
 * hard search off the main thread for too long.
 */
export function getAIMove(board, player, difficulty = 'hard', overrides = {}) {
  const cfg = difficultyProfile(difficulty, overrides);
  const moves = getNearbyCells(board, RADIUS).filter(([r, c]) => board[r][c] === EMPTY);

  if (moves.length === 0) return [CENTER, CENTER];
  if (moves.length === 1) return moves[0];

  // Easy looks only at the position in front of it, with no search at all.
  if (cfg.maxDepth === 0) return moves[Math.floor(Math.random() * moves.length)];

  if (cfg.forced) {
    const win = findWinningMove(board, player);
    if (win) return win;
    const block = findWinningMove(board, OPPONENT[player]);
    if (block) return block;
  }

  const result = searchMove(board, player, cfg);
  if (result.row === null) return moves[Math.floor(Math.random() * moves.length)];
  return [result.row, result.col];
}
