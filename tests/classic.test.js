import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BLACK, WHITE, createBoard, placeStone } from '../src/lib/gomoku.js';
import { OPENINGS } from '../src/lib/openings.js';
import {
  classifyPlacement, findMasterTactic, lookupBook, placeSymmetry,
} from '../src/lib/classic.js';
import { getAIMove } from '../src/lib/ai.js';
import { buildJevRequest, chooseMove } from '../src/lib/jev/move.js';

function placeAll(pairs, player, board = createBoard()) {
  let next = board;
  for (const [row, col] of pairs) next = placeStone(next, row, col, player);
  return next;
}

describe('opening book', () => {
  it('names all 26 canonical openings', () => {
    assert.equal(OPENINGS.length, 26);
    for (const opening of OPENINGS) {
      let board = placeStone(createBoard(), 7, 7, BLACK);
      board = placeStone(board, opening.white[0], opening.white[1], WHITE);
      board = placeStone(board, opening.black[0], opening.black[1], BLACK);
      const book = lookupBook(board);
      assert.equal(book?.opening?.name, opening.name, opening.chinese);
      assert.equal(book.prescribe, false);
      assert.match(book.opening.recorded, /H8/);
    }
  });

  it('recognises Flower moon after rotation', () => {
    for (let transform = 0; transform < 8; transform++) {
      let board = createBoard();
      for (const [row, col, player] of [[7, 7, BLACK], [6, 7, WHITE], [6, 8, BLACK]]) {
        const [rr, cc] = placeSymmetry(transform, row, col);
        board = placeStone(board, rr, cc, player);
      }
      assert.equal(lookupBook(board)?.opening?.chinese, '花月', `transform ${transform}`);
    }
  });

  it('offers the eight adjacent replies to a centre stone', () => {
    const book = lookupBook(placeStone(createBoard(), 7, 7, BLACK));
    assert.equal(book.prescribe, true);
    assert.equal(book.next.length, 8);
    for (const move of book.next) {
      const distance = Math.max(Math.abs(move.row - 7), Math.abs(move.col - 7));
      assert.equal(distance, 1);
    }
    const direct = book.next.find(move => move.row === 6 && move.col === 7);
    assert.equal(direct.name, 'Direct opening');
  });

  it('names both wings of Flower moon as black\'s third stone', () => {
    let board = placeStone(createBoard(), 7, 7, BLACK);
    board = placeStone(board, 6, 7, WHITE);
    const book = lookupBook(board);
    const names = new Map(book.next.map(move => [`${move.row},${move.col}`, move.name]));
    assert.equal(names.get('6,8'), 'Flower moon');
    assert.equal(names.get('6,6'), 'Flower moon');
  });

  it('names Po moon when white stands on the diagonal', () => {
    let board = placeStone(createBoard(), 7, 7, BLACK);
    board = placeStone(board, 6, 8, WHITE);
    const book = lookupBook(board);
    const po = book.next.find(move => move.row === 8 && move.col === 8);
    assert.equal(po?.name, 'Po moon');
    assert.equal(po?.chinese, '浦月');
  });
});

describe('classical shapes', () => {
  it('plays a four-three the consecutive score would call a closed four', () => {
    // (7,7) makes a closed four along the rank and an open three on the file.
    // The far end of the rank is already black, so extending the other way is not an open four.
    let board = placeAll([[7, 8], [7, 9], [7, 10], [5, 7], [6, 7]], WHITE);
    board = placeStone(board, 7, 11, BLACK);
    assert.equal(classifyPlacement(board, WHITE, 7, 7).combination, 'four-three');
    const tactic = findMasterTactic(board, WHITE);
    assert.equal(tactic.reason, 'four-three');
    assert.deepEqual([tactic.row, tactic.col], [7, 7]);
  });

  it('blocks the gap of a jump three', () => {
    // Black has XX.X . Filling the gap makes an open four. The old evaluator
    // never sees three consecutive stones here.
    let board = placeAll([[7, 5], [7, 6], [7, 8]], BLACK);
    board = placeStone(board, 10, 10, WHITE);
    const tactic = findMasterTactic(board, WHITE);
    assert.equal(tactic.reason, 'block-open-four');
    assert.deepEqual([tactic.row, tactic.col], [7, 7]);
    assert.deepEqual(getAIMove(board, WHITE, 'master'), [7, 7]);
  });

  it('plays the double-three fork', () => {
    let board = placeAll([[7, 6], [7, 7], [5, 8], [6, 8]], WHITE);
    board = placeAll([[0, 0], [0, 1], [14, 14]], BLACK, board);
    const before = board.map(row => row.slice());
    const tactic = findMasterTactic(board, WHITE);
    assert.deepEqual(board, before);
    assert.equal(tactic.reason, 'double-three');
    assert.deepEqual([tactic.row, tactic.col], [7, 8]);
    assert.deepEqual(getAIMove(board, WHITE, 'master'), [7, 8]);
  });

  it('takes an open four at either end of an open three', () => {
    let board = placeAll([[7, 5], [7, 6], [7, 7]], WHITE);
    board = placeStone(board, 0, 0, BLACK);
    const tactic = findMasterTactic(board, WHITE);
    assert.equal(tactic.reason, 'open-four');
    assert.equal(tactic.row, 7);
    assert.ok(tactic.col === 4 || tactic.col === 8);
  });

  it('does not invent a tactic on an empty centre', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    assert.equal(findMasterTactic(board, WHITE), null);
  });

  it('answers the centre from the classical replies', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const [row, col] = getAIMove(board, WHITE, 'master', { maxDepth: 2, nodeBudget: 8_000 });
    assert.equal(Math.max(Math.abs(row - 7), Math.abs(col - 7)), 1);
    assert.equal(board[row][col], 0);
  });
});

describe('master requests', () => {
  it('tells Jev which recorded opening a candidate begins', () => {
    let board = placeStone(createBoard(), 7, 7, BLACK);
    board = placeStone(board, 6, 7, WHITE);
    const book = lookupBook(board);
    const ranked = book.next.slice(0, 6).map(move => ({
      row: move.row,
      col: move.col,
      score: 20,
      line: [[move.row, move.col]],
    }));
    const request = buildJevRequest(board, BLACK, {
      difficulty: 'master', ranked, depth: 2, book,
    });
    assert.match(request.state.book.label, /direct opening/);
    const flower = Object.values(request.criteria).find(note => note.book_opening === 'Flower moon');
    assert.equal(flower.book_move, true);
    assert.equal(typeof flower.classic.combination, 'string');
    assert.match(request.instructions.focus, /book_move/);
  });

  it('names Flower moon once the three stones are down', () => {
    let board = placeAll([[7, 7], [6, 8]], BLACK);
    board = placeStone(board, 6, 7, WHITE);
    const request = buildJevRequest(board, WHITE, {
      difficulty: 'master',
      ranked: [{ row: 8, col: 8, score: 5, line: [[8, 8]] }],
      depth: 4,
    });
    assert.equal(request.state.book.opening, 'Flower moon');
    assert.equal(request.state.book.chinese, '花月');
    assert.match(request.state.book.recorded, /H8/);
  });

  it('plays a jump-three block without asking Jev', async () => {
    let board = placeAll([[7, 5], [7, 6], [7, 8]], BLACK);
    board = placeStone(board, 10, 10, WHITE);
    let asked = false;
    const move = await chooseMove({
      board,
      player: WHITE,
      difficulty: 'master',
      ask: async () => { asked = true; return { choice: 'r0c0', confidence: 1 }; },
    });
    assert.equal(asked, false);
    assert.equal(move.source, 'classic');
    assert.deepEqual([move.row, move.col], [7, 7]);
  });

  it('leaves the hard request without a book', () => {
    const board = placeStone(createBoard(), 7, 7, BLACK);
    const request = buildJevRequest(board, WHITE, {
      difficulty: 'hard',
      ranked: [{ row: 7, col: 8, score: 1, line: [[7, 8]] }],
      depth: 2,
    });
    assert.equal(request.state.book, undefined);
    assert.equal(request.criteria.r7c8.classic, undefined);
  });
});
