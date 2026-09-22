import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BOARD_SIZE, EMPTY, BLACK, WHITE, createBoard, placeStone } from '../src/lib/gomoku.js';
import { getAIMove, evaluateBoard, scorePattern } from '../src/lib/ai.js';

// ── helpers ───────────────────────────────────────────────────────────────────
function placeRow(board, row, colStart, player, len) {
  let b = board;
  for (let i = 0; i < len; i++) b = placeStone(b, row, colStart + i, player);
  return b;
}
function placeCol(board, col, rowStart, player, len) {
  let b = board;
  for (let i = 0; i < len; i++) b = placeStone(b, rowStart + i, col, player);
  return b;
}

// ── scorePattern ──────────────────────────────────────────────────────────────
describe('scorePattern', () => {
  it('five or more returns max score', () => {
    assert.equal(scorePattern(5, 2), 100000);
    assert.equal(scorePattern(6, 0), 100000);
  });

  it('open four scores higher than closed four', () => {
    assert.ok(scorePattern(4, 2) > scorePattern(4, 1));
    assert.ok(scorePattern(4, 1) > scorePattern(4, 0));
  });

  it('open three scores higher than closed three', () => {
    assert.ok(scorePattern(3, 2) > scorePattern(3, 1));
  });

  it('open two has a positive score', () => {
    assert.ok(scorePattern(2, 2) > 0);
  });

  it('single stone has a positive score', () => {
    assert.ok(scorePattern(1, 2) > 0);
  });
});

// ── evaluateBoard ─────────────────────────────────────────────────────────────
describe('evaluateBoard', () => {
  it('empty board evaluates to 0', () => {
    assert.equal(evaluateBoard(createBoard(), BLACK), 0);
  });

  it('a single stone gives a positive score for that player', () => {
    const b = placeStone(createBoard(), 7, 7, BLACK);
    assert.ok(evaluateBoard(b, BLACK) > 0);
  });

  it('a winning position scores very high', () => {
    let b = placeRow(createBoard(), 7, 5, BLACK, 5);
    assert.ok(evaluateBoard(b, BLACK) > 50000);
  });

  it('symmetric board evaluates near 0 for either player', () => {
    let b = createBoard();
    b = placeStone(b, 7, 7, BLACK);
    b = placeStone(b, 7, 8, WHITE);
    // Both have one stone — should be close to zero (slight asymmetry due to 1.1 factor)
    const score = evaluateBoard(b, BLACK);
    assert.ok(score > -200 && score < 200);
  });
});

// ── getAIMove ─────────────────────────────────────────────────────────────────
describe('getAIMove (easy)', () => {
  it('returns a valid [row, col] pair', () => {
    const b = placeStone(createBoard(), 7, 7, BLACK);
    const [r, c] = getAIMove(b, WHITE, 'easy');
    assert.ok(r >= 0 && r < BOARD_SIZE);
    assert.ok(c >= 0 && c < BOARD_SIZE);
    assert.equal(b[r][c], EMPTY);
  });
});

describe('getAIMove (medium)', () => {
  it('returns a valid move', () => {
    const b = placeStone(createBoard(), 7, 7, BLACK);
    const [r, c] = getAIMove(b, WHITE, 'medium');
    assert.ok(r >= 0 && r < BOARD_SIZE);
    assert.ok(c >= 0 && c < BOARD_SIZE);
    assert.equal(b[r][c], EMPTY);
  });
});

describe('getAIMove (hard)', () => {
  it('takes an immediate winning move', () => {
    // WHITE has 4 in a row at (7, 5..8), can win at (7, 9)
    let b = placeRow(createBoard(), 7, 5, WHITE, 4);
    // Fill nearby cells with BLACK to avoid trivial board
    b = placeRow(b, 8, 5, BLACK, 4);
    const [r, c] = getAIMove(b, WHITE, 'hard');
    // Should play at (7,4) or (7,9) to win
    const winsAtLeft  = r === 7 && c === 4;
    const winsAtRight = r === 7 && c === 9;
    assert.ok(winsAtLeft || winsAtRight, `AI played [${r},${c}] — expected win move at (7,4) or (7,9)`);
  });

  it('blocks an opponent immediate threat (4 in a row)', () => {
    // BLACK has 4 in a row at (5, 0..3), open ends at col -1 (off-board) and col 4
    let b = placeRow(createBoard(), 5, 0, BLACK, 4);
    // Extra distractor stones
    b = placeStone(b, 7, 7, WHITE);
    const [r, c] = getAIMove(b, WHITE, 'hard');
    // The only non-off-board blocking spot is (5, 4)
    assert.equal(r, 5);
    assert.equal(c, 4);
  });

  it('returns a cell that is currently empty', () => {
    let b = createBoard();
    for (let i = 0; i < 5; i++) {
      b = placeStone(b, 7, i, i % 2 === 0 ? BLACK : WHITE);
    }
    const [r, c] = getAIMove(b, WHITE, 'hard');
    assert.equal(b[r][c], EMPTY);
  });
});
