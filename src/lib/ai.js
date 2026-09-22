/**
 * ai.js — Gomoku AI using minimax with alpha-beta pruning
 */

import {
  BOARD_SIZE, EMPTY, BLACK, WHITE,
  placeStone, checkWin, isFull, getNearbyCells,
} from './gomoku.js';

const OPPONENT = { [BLACK]: WHITE, [WHITE]: BLACK };

// ── Difficulty profiles ───────────────────────────────────────────────────────
const DIFFICULTY = {
  easy:   { depth: 1, random: true },
  medium: { depth: 2, random: false },
  hard:   { depth: 4, random: false },
};

/**
 * Public entry point.
 * Returns [row, col] for the AI's next move.
 */
export function getAIMove(board, player, difficulty = 'hard') {
  const cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.hard;
  const moves = getNearbyCells(board, 2);

  if (moves.length === 0) return [Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2)];

  if (cfg.random) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let bestScore = -Infinity;
  let bestMove = moves[0];

  // Sort moves to try promising positions first (improves α-β cutoffs)
  const sorted = sortMoves(board, moves, player);

  for (const [r, c] of sorted) {
    const newBoard = placeStone(board, r, c, player);
    const score = minimax(newBoard, cfg.depth - 1, false, player, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMove = [r, c];
    }
  }
  return bestMove;
}

/**
 * Minimax with alpha-beta pruning.
 * `player` is the maximising player (the AI) throughout.
 */
export function minimax(board, depth, isMax, player, alpha, beta) {
  // Terminal checks
  if (isTerminal(board, player)) {
    return isMax
      ? -100000 - depth   // opponent just won (last ply was opponent)
      : 100000 + depth;   // AI just won
  }
  if (depth === 0 || isFull(board)) {
    return evaluateBoard(board, player);
  }

  const moves = getNearbyCells(board, 2);
  const sorted = sortMoves(board, moves, isMax ? player : OPPONENT[player]);

  if (isMax) {
    let best = -Infinity;
    for (const [r, c] of sorted) {
      const newBoard = placeStone(board, r, c, player);
      if (checkWin(newBoard, r, c, player)) {
        return 100000 + depth; // immediate win
      }
      const score = minimax(newBoard, depth - 1, false, player, alpha, beta);
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    const opponent = OPPONENT[player];
    let best = Infinity;
    for (const [r, c] of sorted) {
      const newBoard = placeStone(board, r, c, opponent);
      if (checkWin(newBoard, r, c, opponent)) {
        return -100000 - depth; // opponent immediate win
      }
      const score = minimax(newBoard, depth - 1, true, player, alpha, beta);
      best = Math.min(best, score);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/** True if the board is already in a terminal (won) state for either player */
function isTerminal(board, player) {
  const opponent = OPPONENT[player];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (p === EMPTY) continue;
      if (checkWin(board, r, c, p)) return true;
    }
  }
  return false;
}

/**
 * Board evaluation from `player`'s perspective.
 * Scans all lines and scores patterns.
 */
export function evaluateBoard(board, player) {
  const opponent = OPPONENT[player];
  return scoreBoard(board, player) - scoreBoard(board, opponent) * 1.1;
}

function scoreBoard(board, player) {
  let total = 0;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    total += scoreLine(board, player, dr, dc);
  }
  return total;
}

function scoreLine(board, player, dr, dc) {
  let total = 0;
  const visited = new Set();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== player) continue;
      // Walk backwards to find the start of this run
      let sr = r - dr, sc = c - dc;
      while (sr >= 0 && sr < BOARD_SIZE && sc >= 0 && sc < BOARD_SIZE && board[sr][sc] === player) {
        sr -= dr; sc -= dc;
      }
      const key = `${sr + dr},${sc + dc}`;
      if (visited.has(key)) continue;
      visited.add(key);

      // Count run length
      let count = 0;
      let nr = sr + dr, nc = sc + dc;
      while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
        count++;
        nr += dr; nc += dc;
      }

      // Count open ends
      const beforeR = sr, beforeC = sc;
      const afterR = nr, afterC = nc;
      const beforeOpen = (beforeR >= 0 && beforeR < BOARD_SIZE && beforeC >= 0 && beforeC < BOARD_SIZE && board[beforeR][beforeC] === EMPTY) ? 1 : 0;
      const afterOpen  = (afterR  >= 0 && afterR  < BOARD_SIZE && afterC  >= 0 && afterC  < BOARD_SIZE && board[afterR][afterC]  === EMPTY) ? 1 : 0;
      const openEnds = beforeOpen + afterOpen;

      total += scorePattern(count, openEnds);
    }
  }
  return total;
}

/**
 * Score a pattern of `count` consecutive stones with `openEnds` open ends.
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

/** Sort candidate moves by a quick heuristic so α-β prunes more aggressively */
function sortMoves(board, moves, player) {
  const opponent = OPPONENT[player];
  const scored = moves.map(([r, c]) => {
    const b = placeStone(board, r, c, player);
    return { move: [r, c], score: evaluateBoard(b, player) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.move);
}
