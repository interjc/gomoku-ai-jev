/**
 * Decide a Gomoku move.
 * Immediate wins and blocks stay in code. Jev may choose among the other
 * candidate points. The caller runs the local search when this returns no cell.
 */

import {
  BLACK, WHITE,
  placeStone, checkWin, isValidMove, getNearbyCells,
} from '../gomoku.js';

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

export function buildJevRequest(board, player) {
  const criteria = {};
  for (const [row, col] of candidateMoves(board)) {
    const file = String.fromCharCode(65 + col);
    criteria[moveKey(row, col)] = `Empty point ${file}${row + 1}, row ${row}, column ${col}.`;
  }
  return {
    state: {
      rules: 'Gomoku on a 15 by 15 board. Five or more consecutive stones in a row, column, or diagonal wins. X is black, O is white, and a dot is empty. Row 0 is the top. Column 0 is the left.',
      side_to_move: player === BLACK ? 'black (X)' : 'white (O)',
      board: boardText(board),
    },
    instructions: {
      question: 'Which empty point should `side_to_move` play?',
      focus: 'Choose the option that best continues an attack or stops the opponent from making five in a row.',
    },
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
 * @param {number} [options.minConfidence]
 * @param {(request: object) => Promise<{choice?: string, confidence?: number}> | null} [options.ask]
 */
export async function chooseMove({
  board,
  player,
  difficulty = 'hard',
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

  if (difficulty === 'easy' || typeof ask !== 'function' || candidates.length === 0) {
    return localResult(difficulty);
  }

  try {
    const request = buildJevRequest(board, player);
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
