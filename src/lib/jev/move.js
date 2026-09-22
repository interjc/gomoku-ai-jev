/**
 * Decide a Gomoku move.
 * Immediate wins and blocks stay in code. Jev may choose among the other
 * candidate points. The caller runs the local search when this returns no cell.
 */

import {
  BOARD_SIZE, EMPTY, BLACK, WHITE,
  placeStone, checkWin, isValidMove, getNearbyCells,
} from '../gomoku.js';
import { evaluateBoard } from '../ai.js';

const CHOICE_LIMIT = 255;

export function opponentOf(player) {
  return player === BLACK ? WHITE : BLACK;
}

/** A cell that completes five for `player`, or null. */
export function findImmediateWin(board, player) {
  for (const [row, col] of getNearbyCells(board, 1)) {
    if (!isValidMove(board, row, col)) continue;
    const next = placeStone(board, row, col, player);
    if (checkWin(next, row, col, player)) return [row, col];
  }
  return null;
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

const LINE_DIRS = [
  [0, 1, 'horizontal'],
  [1, 0, 'vertical'],
  [1, 1, 'down-diagonal'],
  [1, -1, 'up-diagonal'],
];

const PATTERN_RANK = {
  five: 7,
  'open four': 6,
  'closed four': 5,
  'open three': 4,
  'closed three': 3,
  'open two': 2,
  none: 0,
};

function onBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function patternName(count, openEnds) {
  if (count >= 5) return 'five';
  if (count === 4 && openEnds === 2) return 'open four';
  if (count === 4 && openEnds === 1) return 'closed four';
  if (count === 3 && openEnds === 2) return 'open three';
  if (count === 3 && openEnds === 1) return 'closed three';
  if (count === 2 && openEnds === 2) return 'open two';
  return 'none';
}

/** Longest pattern through a stone that is already on the board. */
function patternsThrough(board, row, col, player) {
  let best = 'none';
  const forcing = [];
  for (const [dr, dc, direction] of LINE_DIRS) {
    let count = 1;
    let r = row + dr;
    let c = col + dc;
    while (onBoard(r, c) && board[r][c] === player) {
      count += 1;
      r += dr;
      c += dc;
    }
    const openAfter = onBoard(r, c) && board[r][c] === EMPTY;
    r = row - dr;
    c = col - dc;
    while (onBoard(r, c) && board[r][c] === player) {
      count += 1;
      r -= dr;
      c -= dc;
    }
    const openBefore = onBoard(r, c) && board[r][c] === EMPTY;
    const pattern = patternName(count, (openAfter ? 1 : 0) + (openBefore ? 1 : 0));
    if (PATTERN_RANK[pattern] > PATTERN_RANK[best]) best = pattern;
    if (pattern === 'open four' || pattern === 'closed four' || pattern === 'open three') {
      forcing.push(`${pattern} ${direction}`);
    }
  }
  return { best, forcing };
}

function bestReply(board, player) {
  const opponent = opponentOf(player);
  let reply = null;
  for (const [row, col] of getNearbyCells(board, 2)) {
    if (!isValidMove(board, row, col)) continue;
    const next = placeStone(board, row, col, opponent);
    const wins = checkWin(next, row, col, opponent);
    const score = wins ? 100000 : evaluateBoard(next, opponent);
    if (!reply || score > reply.score) reply = { row, col, score, wins };
  }
  return reply;
}

function candidateNote(board, player, row, col, difficulty, latest) {
  const point = pointName(row, col);
  if (difficulty === 'easy') {
    const touchesLatest = latest
      ? Math.max(Math.abs(row - latest.row), Math.abs(col - latest.col)) <= 1
      : false;
    return { point, row, col, touches_latest_stone: touchesLatest };
  }

  const after = placeStone(board, row, col, player);
  const made = patternsThrough(after, row, col, player);
  const note = {
    point,
    row,
    col,
    pattern_made: made.best,
    forcing_threats: made.forcing,
    evaluation_after_move: evaluateBoard(after, player),
  };
  if (difficulty === 'hard') {
    const reply = bestReply(after, player);
    if (reply?.wins) {
      note.opponent_reply = `wins immediately at ${pointName(reply.row, reply.col)}`;
      note.evaluation_after_opponent_reply = -100000;
    } else if (reply) {
      const punished = placeStone(after, reply.row, reply.col, opponentOf(player));
      note.opponent_reply = pointName(reply.row, reply.col);
      note.evaluation_after_opponent_reply = evaluateBoard(punished, player);
    }
  }
  return note;
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

const INSTRUCTIONS = {
  easy: {
    question: 'Which empty point would a beginner play for `side_to_move`?',
    standard: 'Easy is the original depth-1 policy: a nearby point chosen without search.',
    focus: 'Read `history` from the first move through the latest. Prefer a candidate whose `touches_latest_stone` is true and that simply extends the latest stone. Do not hunt the sharpest attack.',
  },
  medium: {
    question: 'Which empty point should `side_to_move` play at medium strength?',
    standard: 'Medium is the original depth-2 minimax. It scores one move with the pattern weights in `evaluation`.',
    focus: 'Read the whole `history`. Prefer a higher `evaluation_after_move`, especially an open three, and block the opponent\'s open three. Stay next to the stones already in `history`.',
  },
  hard: {
    question: 'Which empty point should `side_to_move` play at full strength?',
    standard: 'Hard is the original depth-4 alpha-beta search. It orders moves with the weights in `evaluation`, values defense by opponentScore × 1.1, and looks for forcing threats.',
    focus: 'Read the whole `history`. Reject a candidate whose `opponent_reply` wins immediately. Among the rest, prefer a higher `evaluation_after_opponent_reply`, then more entries in `forcing_threats`. Continue a running line from `history` when the notes agree.',
  },
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

export function buildJevRequest(board, player, { difficulty = 'hard', history = [] } = {}) {
  const level = INSTRUCTIONS[difficulty] ? difficulty : 'hard';
  const record = readHistory(board, history);
  const latest = record[record.length - 1] ?? null;
  const criteria = {};
  for (const [row, col] of candidateMoves(board)) {
    criteria[moveKey(row, col)] = candidateNote(board, player, row, col, level, latest);
  }
  const state = {
    rules: 'Gomoku on a 15 by 15 board. Five or more consecutive stones in a row, column, or diagonal wins. X is black, O is white, and a dot is empty. Row 0 is the top. Column 0 is the left. `history` is every move so far, in order.',
    difficulty: level,
    side_to_move: player === BLACK ? 'black (X)' : 'white (O)',
    history: record,
    board: boardText(board),
  };
  if (level !== 'easy') state.evaluation = EVALUATION;
  return {
    state,
    instructions: INSTRUCTIONS[level],
    criteria,
  };
}

function localResult(difficulty) {
  return {
    source: difficulty === 'easy' ? 'local' : 'minimax',
    confidence: null,
  };
}

/**
 * @param {object} options
 * @param {number[][]} options.board
 * @param {number} options.player
 * @param {string} [options.difficulty]
 * @param {Array<{row: number, col: number, player: number}>} [options.history]
 * @param {number} [options.minConfidence]
 * @param {(request: object) => Promise<{choice?: string, confidence?: number}> | null} [options.ask]
 */
export async function chooseMove({
  board,
  player,
  difficulty = 'hard',
  history = [],
  minConfidence = 0.5,
  ask,
}) {
  if (difficulty !== 'easy') {
    const win = findImmediateWin(board, player);
    if (win) {
      return { row: win[0], col: win[1], source: 'rule', confidence: null };
    }
    const block = findImmediateWin(board, opponentOf(player));
    if (block) {
      return { row: block[0], col: block[1], source: 'rule', confidence: null };
    }
  }

  const candidates = candidateMoves(board);
  if (candidates.length === 1) {
    const [row, col] = candidates[0];
    return { row, col, source: 'rule', confidence: null };
  }

  if (typeof ask !== 'function' || candidates.length === 0) {
    return localResult(difficulty);
  }

  try {
    const request = buildJevRequest(board, player, { difficulty, history });
    const answer = await ask(request);
    const parsed = parseMoveKey(answer?.choice);
    const confidence = Number(answer?.confidence);
    if (!parsed || !isValidMove(board, parsed[0], parsed[1])) {
      return localResult(difficulty);
    }
    if (!Number.isFinite(confidence) || confidence < minConfidence) {
      return localResult(difficulty);
    }
    return {
      row: parsed[0],
      col: parsed[1],
      source: 'jev',
      confidence,
    };
  } catch {
    return localResult(difficulty);
  }
}
