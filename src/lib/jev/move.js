/**
 * Decide a Gomoku move.
 *
 * Difficulty is how far ahead the AI looks, and how much of that lookahead Jev
 * gets to see:
 *
 *   easy   — no search. Jev picks from nearby points described by the current
 *            position alone: no scores, no replies, no lookahead.
 *   medium — a depth-2 search shortlists a dozen points. Jev picks among them
 *            with the pattern score and the opponent's best answer.
 *   hard   — an iterative-deepening search with threat extension ranks every
 *            candidate and hands Jev the ones it cannot separate, each with the
 *            verified line behind it. When Jev is torn between the top two, a
 *            second round re-searches just those two deeper and asks again.
 *
 * Immediate wins and blocks stay in code above easy. On hard, Jev only ever
 * chooses among moves the deep search rates as near-equal, so the level is at
 * least as strong as the engine while Jev decides what the engine cannot.
 */

import {
  BOARD_SIZE, BLACK, WHITE,
  isValidMove, getNearbyCells,
} from '../gomoku.js';
import {
  WIN_SCORE, searchMove, findWinningMove, describePlacement,
} from '../ai.js';

const CHOICE_LIMIT = 255;

/**
 * Per-level settings. `shortlist` is how many points Jev is offered — a short,
 * well-described list is chosen far better than a wide one.
 */
export const LEVELS = {
  easy: {
    search: null,
    shortlist: 24,
    forced: false,
    band: null,
    runoff: null,
  },
  medium: {
    search: { maxDepth: 2, width: 14, nodeBudget: 60_000, extensionLimit: 0 },
    shortlist: 12,
    forced: true,
    band: null,
    runoff: null,
  },
  hard: {
    search: { maxDepth: 8, width: 12, nodeBudget: 220_000, extensionLimit: 8 },
    shortlist: 8,
    forced: true,
    // A gap this small is under one closed three — inside it the search has no
    // real opinion, which is exactly where Jev's judgement is worth having.
    band: { absolute: 300, relative: 0.2 },
    runoff: {
      search: { maxDepth: 10, width: 8, nodeBudget: 160_000, extensionLimit: 10 },
      confidence: 0.6,
      margin: 0.1,
    },
  },
};

/** How much the deep search and Jev each count when hard blends the two. */
const SEARCH_WEIGHT = 0.5;
const JEV_WEIGHT = 0.5;

export function opponentOf(player) {
  return player === BLACK ? WHITE : BLACK;
}

/** A cell that completes five for `player`, or null. */
export function findImmediateWin(board, player) {
  return findWinningMove(board, player);
}

export function moveKey(row, col) {
  return `r${row}c${col}`;
}

export function parseMoveKey(key) {
  const match = /^r(\d+)c(\d+)$/.exec(String(key ?? ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function boardText(board) {
  return board.map(row => row.map(cell => {
    if (cell === BLACK) return 'X';
    if (cell === WHITE) return 'O';
    return '.';
  }).join('')).join('\n');
}

export function candidateMoves(board) {
  return getNearbyCells(board, 2)
    .filter(([row, col]) => isValidMove(board, row, col))
    .slice(0, CHOICE_LIMIT);
}

export function pointName(row, col) {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function onBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function lineText(line) {
  return line.map(([row, col]) => pointName(row, col)).join(' ');
}

// ── Candidate notes ───────────────────────────────────────────────────────────

/**
 * Easy sees the position and nothing else: who is next to the point, and
 * whether it sits beside the stone just played. No scores, no lookahead.
 */
function easyNote(board, player, row, col, latest) {
  const opponent = opponentOf(player);
  let own = 0;
  let against = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (!onBoard(r, c)) continue;
      if (board[r][c] === player) own += 1;
      else if (board[r][c] === opponent) against += 1;
    }
  }
  return {
    point: pointName(row, col),
    row,
    col,
    touches_latest_stone: latest
      ? Math.max(Math.abs(row - latest.row), Math.abs(col - latest.col)) <= 1
      : false,
    own_stones_adjacent: own,
    opponent_stones_adjacent: against,
  };
}

/** Medium sees one move and the single best answer to it. */
function mediumNote(board, player, entry, rank) {
  const { row, col } = entry;
  const made = describePlacement(board, player, row, col);
  const reply = entry.line[1] ?? null;
  return {
    point: pointName(row, col),
    row,
    col,
    rank,
    pattern_made: made.pattern,
    forcing_threats: made.forcing,
    score_after_reply: Math.round(entry.score),
    opponent_best_reply: reply ? pointName(reply[0], reply[1]) : null,
  };
}

/** Hard sees the whole line the search verified behind the point. */
function hardNote(board, player, entry, rank, best, depth) {
  const { row, col } = entry;
  const made = describePlacement(board, player, row, col);
  const reply = entry.line[1] ?? null;
  return {
    point: pointName(row, col),
    row,
    col,
    rank,
    pattern_made: made.pattern,
    forcing_threats: made.forcing,
    score_after_line: Math.round(entry.score),
    score_behind_best: Math.round(best - entry.score),
    searched_plies: depth,
    best_line: lineText(entry.line),
    opponent_best_reply: reply ? pointName(reply[0], reply[1]) : null,
    wins_by_force: entry.score >= WIN_SCORE / 2,
    loses_by_force: entry.score <= -WIN_SCORE / 2,
  };
}

/** Keep history entries that match a stone actually on the board. */
export function readHistory(board, history) {
  if (!Array.isArray(history)) return [];
  const moves = [];
  for (const item of history) {
    if (moves.length >= BOARD_SIZE * BOARD_SIZE) break;
    const row = item?.row;
    const col = item?.col;
    const player = item?.player;
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
    if (player !== BLACK && player !== WHITE) continue;
    if (!onBoard(row, col) || board[row][col] !== player) continue;
    moves.push({
      n: moves.length + 1,
      player: player === BLACK ? 'black' : 'white',
      point: pointName(row, col),
      row,
      col,
    });
  }
  return moves;
}

// ── Instructions ──────────────────────────────────────────────────────────────

const INSTRUCTIONS = {
  easy: {
    question: 'Which empty point would a beginner play for `side_to_move`?',
    standard: 'Easy looks only at the position on the board. Nothing here has been searched, and no move has been scored.',
    focus: 'Read `history` from the first move through the latest. Prefer a candidate whose `touches_latest_stone` is true and that simply extends a stone already played. Do not hunt the sharpest attack, and do not plan several moves ahead.',
  },
  medium: {
    question: 'Which empty point should `side_to_move` play at medium strength?',
    standard: 'Medium looked two plies ahead. Each candidate carries the pattern it makes and the opponent\'s single best answer, scored with the weights in `evaluation`. Nothing beyond that reply has been checked.',
    focus: 'Read the whole `history`. Prefer a higher `score_after_reply`, especially a candidate that makes an open three, and block the opponent\'s open three. Stay next to the stones already played. A lower `rank` is the search\'s own order.',
  },
  hard: {
    question: 'Which empty point should `side_to_move` play at full strength?',
    standard: 'Hard searched `searched_plies` plies deep with alpha-beta, extending forcing lines further, and every candidate offered here is one the search could not separate from the best. `best_line` is the line it verified, starting with the candidate itself. `score_after_line` is the position at the end of that line, scored with the weights in `evaluation`.',
    focus: 'Play to win. Never pick a candidate whose `loses_by_force` is true, and always pick one whose `wins_by_force` is true. Otherwise prefer the candidate that keeps the initiative: more entries in `forcing_threats`, a `best_line` that keeps making threats the opponent must answer, and a `pattern_made` that builds toward an open four. Treat a small `score_behind_best` as no difference at all, and use the lines and the running shape in `history` to break the tie.',
  },
};

const RUNOFF_INSTRUCTIONS = {
  question: 'These two points survived the first pass. Which one should `side_to_move` play?',
  standard: 'Both were re-searched deeper than before, to `searched_plies` plies, following forcing lines further still. `best_line` is the refreshed line behind each point.',
  focus: 'Compare the two lines directly. Prefer the point whose line leaves the opponent answering threats rather than making them, and which reaches an open four or a double threat sooner. Never pick one whose `loses_by_force` is true.',
};

const EVALUATION = {
  five: 100000,
  open_four: 10000,
  closed_four: 1000,
  open_three: 1000,
  closed_three: 100,
  open_two: 100,
  formula: 'ownScore - opponentScore * 1.1',
};

/**
 * Build the Choice request for one round.
 *
 * @param {number[][]} board
 * @param {number} player
 * @param {object} [options]
 * @param {'easy'|'medium'|'hard'} [options.difficulty]
 * @param {Array<{row: number, col: number, player: number}>} [options.history]
 * @param {Array<{row: number, col: number, score: number, line: Array<[number, number]>}>} [options.ranked]
 *   Search results for the points to offer. Omitted on easy.
 * @param {number} [options.depth] Plies the search completed.
 * @param {boolean} [options.runoff] Use the deeper second-round wording.
 */
export function buildJevRequest(board, player, {
  difficulty = 'hard',
  history = [],
  ranked = null,
  depth = 0,
  runoff = false,
} = {}) {
  const level = LEVELS[difficulty] ? difficulty : 'hard';
  const record = readHistory(board, history);
  const latest = record[record.length - 1] ?? null;
  const criteria = {};

  if (level === 'easy' || !ranked) {
    const points = candidateMoves(board).slice(0, LEVELS[level].shortlist);
    for (const [row, col] of points) {
      criteria[moveKey(row, col)] = easyNote(board, player, row, col, latest);
    }
  } else if (level === 'medium') {
    ranked.forEach((entry, i) => {
      criteria[moveKey(entry.row, entry.col)] = mediumNote(board, player, entry, i + 1);
    });
  } else {
    const best = ranked[0]?.score ?? 0;
    ranked.forEach((entry, i) => {
      criteria[moveKey(entry.row, entry.col)] = hardNote(board, player, entry, i + 1, best, depth);
    });
  }

  const state = {
    rules: 'Gomoku on a 15 by 15 board. Five or more consecutive stones in a row, column, or diagonal wins. X is black, O is white, and a dot is empty. Row 0 is the top. Column 0 is the left. `history` is every move so far, in order.',
    difficulty: level,
    side_to_move: player === BLACK ? 'black (X)' : 'white (O)',
    history: record,
    board: boardText(board),
  };
  if (level !== 'easy') {
    state.evaluation = EVALUATION;
    state.searched_plies = depth;
  }

  return {
    state,
    instructions: runoff ? RUNOFF_INSTRUCTIONS : INSTRUCTIONS[level],
    criteria,
  };
}

// ── Shortlisting and blending ─────────────────────────────────────────────────

/**
 * The candidates worth offering Jev.
 *
 * On hard this is the near-equal band: a forced win is played outright, a
 * forced loss is dropped, and what remains is everything within a score gap the
 * search considers noise. That band is the guarantee that hard never plays a
 * move the search knows to be worse.
 */
export function shortlist(ranked, cfg) {
  if (!ranked || ranked.length === 0) return [];
  if (!cfg.band) return ranked.slice(0, cfg.shortlist);

  if (ranked[0].score >= WIN_SCORE / 2) return [ranked[0]];

  const survivors = ranked.filter(entry => entry.score > -WIN_SCORE / 2);
  const pool = survivors.length > 0 ? survivors : ranked;
  const best = pool[0].score;
  const tolerance = Math.max(cfg.band.absolute, Math.abs(best) * cfg.band.relative);
  return pool.filter(entry => entry.score >= best - tolerance).slice(0, cfg.shortlist);
}

/**
 * Combine the search ranking with Jev's distribution over the same points.
 * Search scores are normalised across the shortlist, so within a band the two
 * carry comparable weight and Jev effectively decides.
 */
function blend(entries, answer) {
  const scores = entries.map(entry => entry.score);
  const high = Math.max(...scores);
  const low = Math.min(...scores);
  const span = high - low || 1;

  const probabilities = answer?.probabilities ?? null;
  const chosen = answer?.choice ?? null;

  return entries
    .map(entry => {
      const key = moveKey(entry.row, entry.col);
      // Without a distribution, fall back to Jev's single pick.
      const jev = probabilities
        ? Number(probabilities[key]) || 0
        : (key === chosen ? 1 : 0);
      return {
        ...entry,
        jev,
        combined: ((entry.score - low) / span) * SEARCH_WEIGHT + jev * JEV_WEIGHT,
      };
    })
    .sort((a, b) => b.combined - a.combined);
}

// ── Entry point ───────────────────────────────────────────────────────────────

function ruleMove(row, col) {
  return { row, col, source: 'rule', confidence: null, depth: 0 };
}

/**
 * @param {object} options
 * @param {number[][]} options.board
 * @param {number} options.player
 * @param {'easy'|'medium'|'hard'} [options.difficulty]
 * @param {Array<{row: number, col: number, player: number}>} [options.history]
 * @param {number} [options.minConfidence]
 * @param {(request: object) => Promise<{choice?: string, confidence?: number,
 *          probabilities?: Record<string, number>}> | null} [options.ask]
 */
export async function chooseMove({
  board,
  player,
  difficulty = 'hard',
  history = [],
  minConfidence = 0.5,
  ask,
}) {
  const level = LEVELS[difficulty] ? difficulty : 'hard';
  const cfg = LEVELS[level];

  // 1. Forced points stay in code, so they are never lost to a bad guess.
  if (cfg.forced) {
    const win = findWinningMove(board, player);
    if (win) return ruleMove(win[0], win[1]);
    const block = findWinningMove(board, opponentOf(player));
    if (block) return ruleMove(block[0], block[1]);
  }

  const legal = candidateMoves(board);
  if (legal.length === 0) {
    const centre = Math.floor(BOARD_SIZE / 2);
    if (isValidMove(board, centre, centre)) return ruleMove(centre, centre);
    return { row: null, col: null, source: 'local', confidence: null, depth: 0 };
  }
  if (legal.length === 1) return ruleMove(legal[0][0], legal[0][1]);

  // 2. Look ahead as far as this level allows.
  let ranked = null;
  let depth = 0;
  let nodes = 0;
  if (cfg.search) {
    const result = searchMove(board, player, cfg.search);
    if (result.row !== null) {
      ranked = result.ranked;
      depth = result.depth;
      nodes = result.nodes;
    }
  }

  const offered = ranked ? shortlist(ranked, cfg) : [];
  const searchFallback = () => (ranked
    ? { row: ranked[0].row, col: ranked[0].col, source: 'search', confidence: null, depth, nodes }
    : randomNearby(legal));

  // A single near-equal candidate means the search has an opinion; trust it.
  if (ranked && offered.length === 1) {
    return {
      row: offered[0].row, col: offered[0].col, source: 'search', confidence: null, depth, nodes,
    };
  }

  if (typeof ask !== 'function') return searchFallback();

  try {
    // 3. Ask Jev to choose among what the search could not separate.
    const request = buildJevRequest(board, player, {
      difficulty: level, history, ranked: offered.length > 0 ? offered : null, depth,
    });
    const answer = await ask(request);
    const confidence = Number(answer?.confidence);
    const picked = parseMoveKey(answer?.choice);

    if (!picked || !isValidMove(board, picked[0], picked[1])) return searchFallback();
    if (!Number.isFinite(confidence) || confidence < minConfidence) return searchFallback();

    // Easy and medium take Jev's pick as it stands.
    if (offered.length === 0) {
      return { row: picked[0], col: picked[1], source: 'jev', confidence, depth, nodes, rounds: 1 };
    }

    const inBand = offered.some(entry => entry.row === picked[0] && entry.col === picked[1]);
    if (!inBand) return searchFallback();
    if (!cfg.band) {
      return { row: picked[0], col: picked[1], source: 'jev', confidence, depth, nodes, rounds: 1 };
    }

    let combined = blend(offered, answer);

    // 4. Hard only: when Jev is unsure or the top two are close, re-search just
    //    those two deeper and let it choose again on better information.
    const runoff = cfg.runoff;
    const close = combined.length >= 2
      && (confidence < runoff.confidence
        || combined[0].combined - combined[1].combined < runoff.margin);

    if (runoff && combined.length >= 2 && close) {
      const finalists = combined.slice(0, 2);
      const deeper = searchMove(board, player, {
        ...runoff.search,
        rootMoves: finalists.map(entry => [entry.row, entry.col]),
      });
      if (deeper.row !== null && deeper.ranked.length === 2) {
        const second = await ask(buildJevRequest(board, player, {
          difficulty: level, history, ranked: deeper.ranked, depth: deeper.depth, runoff: true,
        }));
        const refined = blend(deeper.ranked, second);
        const top = refined[0];
        if (isValidMove(board, top.row, top.col)) {
          return {
            row: top.row,
            col: top.col,
            source: 'jev',
            confidence: Number(second?.confidence) || confidence,
            depth: deeper.depth,
            nodes: nodes + deeper.nodes,
            rounds: 2,
          };
        }
      }
    }

    const top = combined[0];
    return {
      row: top.row, col: top.col, source: 'jev', confidence, depth, nodes, rounds: 1,
    };
  } catch {
    return searchFallback();
  }
}

function randomNearby(legal) {
  const [row, col] = legal[Math.floor(Math.random() * legal.length)];
  return { row, col, source: 'local', confidence: null, depth: 0 };
}
