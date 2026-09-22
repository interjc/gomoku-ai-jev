import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BOARD_SIZE, EMPTY, BLACK, WHITE, createBoard, placeStone, checkWin } from '../src/lib/gomoku.js';
import {
  getAIMove, evaluateBoard, scorePattern, searchMove, DIFFICULTY, WIN_SCORE,
} from '../src/lib/ai.js';

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

// ── search ────────────────────────────────────────────────────────────────────
describe('searchMove', () => {
  it('ranks every root candidate with the line behind it', () => {
    let b = placeStone(createBoard(), 7, 7, BLACK);
    b = placeStone(b, 7, 8, WHITE);
    const result = searchMove(b, WHITE, DIFFICULTY.hard);
    assert.ok(result.ranked.length >= 2);
    assert.ok(result.depth >= 2);
    for (const entry of result.ranked) {
      assert.equal(b[entry.row][entry.col], EMPTY);
      assert.deepEqual(entry.line[0], [entry.row, entry.col]);
    }
    // Sorted best first.
    for (let i = 1; i < result.ranked.length; i++) {
      assert.ok(result.ranked[i - 1].score >= result.ranked[i].score);
    }
  });

  it('keeps medium to a two-ply horizon', () => {
    const b = placeStone(createBoard(), 7, 7, BLACK);
    const result = searchMove(b, WHITE, DIFFICULTY.medium);
    assert.equal(result.depth, 2);
  });

  it('honours the node budget', () => {
    const b = placeStone(createBoard(), 7, 7, BLACK);
    const budget = 3000;
    const result = searchMove(b, WHITE, { ...DIFFICULTY.hard, nodeBudget: budget });
    assert.ok(result.nodes <= budget + DIFFICULTY.hard.width, `used ${result.nodes} nodes`);
    assert.ok(Number.isInteger(result.row));
  });

  it('can restrict the root to named points', () => {
    const b = placeStone(createBoard(), 7, 7, BLACK);
    const result = searchMove(b, WHITE, {
      ...DIFFICULTY.hard,
      rootMoves: [[7, 8], [6, 6]],
    });
    assert.equal(result.ranked.length, 2);
    const points = result.ranked.map(e => `${e.row},${e.col}`).sort();
    assert.deepEqual(points, ['6,6', '7,8']);
  });
});

describe('hard tactics', () => {
  it('finds the double-three fork and scores it as a forced win', () => {
    // I8 makes a horizontal open three and a vertical open three at once.
    let b = createBoard();
    for (const [r, c] of [[7, 6], [7, 7], [5, 8], [6, 8]]) b = placeStone(b, r, c, WHITE);
    for (const [r, c] of [[0, 0], [0, 1], [14, 14]]) b = placeStone(b, r, c, BLACK);

    assert.deepEqual(getAIMove(b, WHITE, 'hard'), [7, 8]);
    const result = searchMove(b, WHITE, DIFFICULTY.hard);
    assert.ok(result.score >= WIN_SCORE / 2, `expected a forced win, scored ${result.score}`);
  });

  it('answers an open three instead of building elsewhere', () => {
    let b = createBoard();
    for (const [r, c] of [[7, 6], [7, 7], [7, 8]]) b = placeStone(b, r, c, BLACK);
    for (const [r, c] of [[10, 3], [11, 4]]) b = placeStone(b, r, c, WHITE);
    const [r, c] = getAIMove(b, WHITE, 'hard');
    assert.ok((r === 7 && c === 5) || (r === 7 && c === 9), `played [${r},${c}] instead of an end of the three`);
  });

  it('beats the easy level from both colours', () => {
    for (const hardIsBlack of [true, false]) {
      let b = placeStone(createBoard(), 7, 7, hardIsBlack ? WHITE : BLACK);
      let player = hardIsBlack ? BLACK : WHITE;
      let winner = null;
      for (let turn = 0; turn < 120; turn++) {
        const level = player === (hardIsBlack ? BLACK : WHITE) ? 'hard' : 'easy';
        const [r, c] = getAIMove(b, player, level);
        b = placeStone(b, r, c, player);
        if (checkWin(b, r, c, player)) { winner = player; break; }
        player = player === BLACK ? WHITE : BLACK;
      }
      assert.equal(winner, hardIsBlack ? BLACK : WHITE, 'hard should beat easy');
    }
  });
});
