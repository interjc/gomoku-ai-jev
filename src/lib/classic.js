/**
 * Master-level reading for freestyle Gomoku.
 *
 * The alpha-beta evaluator only scores consecutive runs, so a jump four
 * (XX.XX) or a four-three never looks like a win until the search happens
 * to walk into it. A length-5 window sees those shapes directly. Continuous
 * fours are then solved on their own, because the defender's reply is forced
 * and the branch is tiny.
 *
 * Openings are the 26 classical shapes. Matching is exact, under rotation
 * and reflection, and only the recorded next stone is offered — never a
 * whole game pasted into the request.
 */

import { BOARD_SIZE, EMPTY, BLACK, WHITE } from './gomoku.js';
import { OPENINGS } from './openings.js';

const N = BOARD_SIZE;
const CENTER = 7;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const RADIUS = 2;
const VCF_DEPTH = 6;
const VCF_NODES = 800;

const OPPONENT = { [BLACK]: WHITE, [WHITE]: BLACK };

// Inverse of transform t is INV[t]. 0 identity, 1 rot90, 2 rot180, 3 rot270,
// 4 mirror left-right, 5 mirror up-down, 6 main diagonal, 7 anti-diagonal.
const INV = [0, 3, 2, 1, 4, 5, 6, 7];

function mapDelta(transform, dr, dc) {
  switch (transform) {
    case 0: return [dr, dc];
    case 1: return [dc, -dr];
    case 2: return [-dr, -dc];
    case 3: return [-dc, dr];
    case 4: return [dr, -dc];
    case 5: return [-dr, dc];
    case 6: return [dc, dr];
    default: return [-dc, -dr];
  }
}

/** Map a canonical point onto the board orientation `transform`. */
export function placeSymmetry(transform, row, col) {
  const [dr, dc] = mapDelta(INV[transform], row - CENTER, col - CENTER);
  return [CENTER + dr, CENTER + dc];
}

function toCanonical(transform, row, col) {
  const [dr, dc] = mapDelta(transform, row - CENTER, col - CENTER);
  return [CENTER + dr, CENTER + dc];
}

function pointName(row, col) {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function toCells(board) {
  const cells = new Int8Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) cells[r * N + c] = board[r][c];
  }
  return cells;
}

function inBounds(row, col) {
  return row >= 0 && row < N && col >= 0 && col < N;
}

/**
 * Fours and fives created by the stone already at (row, col).
 * Every threat of length 5 sits in some window of five cells that includes
 * the new stone: four of ours and one empty is a four, five is a win.
 */
function threatsCreated(cells, row, col, player) {
  const blocks = new Set();
  let five = false;
  for (let d = 0; d < 4; d++) {
    const [sdr, sdc] = DIRS[d];
    for (let start = -4; start <= 0; start++) {
      let stones = 0;
      let empty = -1;
      let valid = true;
      for (let k = 0; k < 5; k++) {
        const rr = row + (start + k) * sdr;
        const cc = col + (start + k) * sdc;
        if (!inBounds(rr, cc)) { valid = false; break; }
        const value = cells[rr * N + cc];
        if (value === player) stones += 1;
        else if (value === EMPTY) {
          if (empty >= 0) { valid = false; break; }
          empty = rr * N + cc;
        } else { valid = false; break; }
      }
      if (!valid) continue;
      if (stones === 5) five = true;
      else if (stones === 4 && empty >= 0) blocks.add(empty);
    }
  }
  return { five, blocks: [...blocks] };
}

function candidateIndexes(cells) {
  const near = new Uint8Array(N * N);
  let any = false;
  for (let i = 0; i < N * N; i++) {
    if (cells[i] === EMPTY) continue;
    any = true;
    const row = (i / N) | 0;
    const col = i % N;
    for (let dr = -RADIUS; dr <= RADIUS; dr++) {
      for (let dc = -RADIUS; dc <= RADIUS; dc++) {
        const rr = row + dr;
        const cc = col + dc;
        if (!inBounds(rr, cc)) continue;
        const j = rr * N + cc;
        if (cells[j] === EMPTY) near[j] = 1;
      }
    }
  }
  const out = [];
  for (let i = 0; i < N * N; i++) if (near[i]) out.push(i);
  if (!any && cells[CENTER * N + CENTER] === EMPTY) out.push(CENTER * N + CENTER);
  return out;
}

function aligned(row, col, blocks) {
  if (blocks.length <= 1) return true;
  const r0 = (blocks[0] / N) | 0;
  const c0 = blocks[0] % N;
  const dr0 = r0 - row;
  const dc0 = c0 - col;
  for (let i = 1; i < blocks.length; i++) {
    const rr = (blocks[i] / N) | 0;
    const cc = blocks[i] % N;
    if ((rr - row) * dc0 - (cc - col) * dr0 !== 0) return false;
  }
  return true;
}

function pack(index, reason) {
  return { row: (index / N) | 0, col: index % N, reason };
}

function bestIndex(cells, player, indexes) {
  let best = indexes[0];
  let bestScore = -Infinity;
  for (const index of indexes) {
    const row = (index / N) | 0;
    const col = index % N;
    cells[index] = player;
    const threat = threatsCreated(cells, row, col, player);
    cells[index] = EMPTY;
    const score = (threat.five ? 100 : 0) + threat.blocks.length * 10
      - (Math.abs(row - CENTER) + Math.abs(col - CENTER));
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

function fiveMoves(cells, player) {
  const found = [];
  for (const index of candidateIndexes(cells)) {
    const row = (index / N) | 0;
    const col = index % N;
    cells[index] = player;
    const threat = threatsCreated(cells, row, col, player);
    cells[index] = EMPTY;
    if (threat.five) found.push(index);
  }
  return found;
}

function openFourMoves(cells, player) {
  const found = [];
  for (const index of candidateIndexes(cells)) {
    const row = (index / N) | 0;
    const col = index % N;
    cells[index] = player;
    const threat = threatsCreated(cells, row, col, player);
    cells[index] = EMPTY;
    if (!threat.five && threat.blocks.length >= 2) {
      found.push({ index, open: aligned(row, col, threat.blocks) });
    }
  }
  return found;
}

/** Cells where playing makes an open four or a double four, without already winning. */
function liveFourPoints(cells, player) {
  const points = [];
  for (const index of candidateIndexes(cells)) {
    const row = (index / N) | 0;
    const col = index % N;
    cells[index] = player;
    const threat = threatsCreated(cells, row, col, player);
    cells[index] = EMPTY;
    if (!threat.five && threat.blocks.length >= 2) points.push(index);
  }
  return points;
}

function stillLive(cells, index, player) {
  const row = (index / N) | 0;
  const col = index % N;
  if (cells[index] !== EMPTY) return false;
  cells[index] = player;
  const threat = threatsCreated(cells, row, col, player);
  cells[index] = EMPTY;
  return !threat.five && threat.blocks.length >= 2;
}

function hasIndependentPair(cells, player, points) {
  if (points.length < 2) return false;
  const opponent = OPPONENT[player];
  const limit = Math.min(points.length, 12);
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      cells[points[i]] = opponent;
      const other = stillLive(cells, points[j], player);
      cells[points[i]] = EMPTY;
      if (other) return true;
    }
  }
  return false;
}

function followUpWins(cells, player) {
  for (const index of candidateIndexes(cells)) {
    const row = (index / N) | 0;
    const col = index % N;
    cells[index] = player;
    const threat = threatsCreated(cells, row, col, player);
    cells[index] = EMPTY;
    if (threat.five || threat.blocks.length >= 2) return true;
  }
  return false;
}

function defenderStrikes(cells, index, defender) {
  const row = (index / N) | 0;
  const col = index % N;
  const threat = threatsCreated(cells, row, col, defender);
  return threat.five || threat.blocks.length >= 2;
}

/**
 * A move that makes exactly one four, and after the forced block still wins
 * by an open four or a five. Covers the classical four-three.
 */
function findFourThree(cells, player) {
  const opponent = OPPONENT[player];
  const found = [];
  for (const index of candidateIndexes(cells)) {
    const row = (index / N) | 0;
    const col = index % N;
    cells[index] = player;
    const threat = threatsCreated(cells, row, col, player);
    let wins = false;
    if (!threat.five && threat.blocks.length === 1) {
      const block = threat.blocks[0];
      cells[block] = opponent;
      wins = !defenderStrikes(cells, block, opponent) && followUpWins(cells, player);
      cells[block] = EMPTY;
    }
    cells[index] = EMPTY;
    if (wins) found.push(index);
  }
  return found;
}

function findDoubleThree(cells, player, quietOnly) {
  // A double three loses the tempo if the other side can answer with a four.
  // Defensive scans set quietOnly false: we still need to see the threat.
  if (quietOnly) {
    const opponent = OPPONENT[player];
    for (const index of candidateIndexes(cells)) {
      const row = (index / N) | 0;
      const col = index % N;
      cells[index] = opponent;
      const threat = threatsCreated(cells, row, col, opponent);
      cells[index] = EMPTY;
      if (threat.five || threat.blocks.length >= 1) return [];
    }
  }

  const found = [];
  for (const index of candidateIndexes(cells)) {
    const row = (index / N) | 0;
    const col = index % N;
    cells[index] = player;
    const threat = threatsCreated(cells, row, col, player);
    let wins = false;
    if (!threat.five && threat.blocks.length === 0) {
      const points = liveFourPoints(cells, player);
      wins = hasIndependentPair(cells, player, points);
    }
    cells[index] = EMPTY;
    if (wins) found.push(index);
  }
  return found;
}

function searchVcf(cells, attacker, depth, budget) {
  if (budget.n > budget.cap) return null;
  budget.n += 1;

  const fours = [];
  for (const index of candidateIndexes(cells)) {
    const row = (index / N) | 0;
    const col = index % N;
    cells[index] = attacker;
    const threat = threatsCreated(cells, row, col, attacker);
    cells[index] = EMPTY;
    if (threat.five || threat.blocks.length >= 2) return { index, line: [index] };
    if (threat.blocks.length === 1) fours.push({ index, block: threat.blocks[0] });
  }
  if (depth <= 0 || fours.length === 0) return null;

  const defender = OPPONENT[attacker];
  for (const four of fours) {
    if (budget.n > budget.cap) return null;
    cells[four.index] = attacker;
    cells[four.block] = defender;
    const stopped = defenderStrikes(cells, four.block, defender);
    const child = stopped ? null : searchVcf(cells, attacker, depth - 1, budget);
    cells[four.block] = EMPTY;
    cells[four.index] = EMPTY;
    if (child) return { index: four.index, line: [four.index, four.block, ...child.line] };
  }
  return null;
}

function describeMove(cells, row, col, player) {
  const index = row * N + col;
  cells[index] = player;
  const threat = threatsCreated(cells, row, col, player);
  if (threat.five) {
    cells[index] = EMPTY;
    return { combination: 'five', fours: 1, live_threes: 0 };
  }
  if (threat.blocks.length >= 2) {
    const combination = aligned(row, col, threat.blocks) ? 'open-four' : 'double-four';
    cells[index] = EMPTY;
    return { combination, fours: threat.blocks.length, live_threes: 0 };
  }

  let fourThree = false;
  if (threat.blocks.length === 1) {
    const opponent = OPPONENT[player];
    const block = threat.blocks[0];
    cells[block] = opponent;
    fourThree = !defenderStrikes(cells, block, opponent) && followUpWins(cells, player);
    cells[block] = EMPTY;
  }

  const points = threat.blocks.length > 0 ? [] : liveFourPoints(cells, player);
  const doubleThree = points.length >= 2 && hasIndependentPair(cells, player, points);
  cells[index] = EMPTY;

  if (fourThree) return { combination: 'four-three', fours: 1, live_threes: 1 };
  if (doubleThree) return { combination: 'double-three', fours: 0, live_threes: 2 };
  if (threat.blocks.length === 1) return { combination: 'four', fours: 1, live_threes: 0 };
  if (points.length >= 1) return { combination: 'open-three', fours: 0, live_threes: 1 };
  return { combination: 'none', fours: 0, live_threes: 0 };
}

/**
 * Static shape of playing (row, col), for the note attached to a candidate.
 * @returns {{ combination: string, fours: number, live_threes: number }}
 */
export function classifyPlacement(board, player, row, col) {
  if (!inBounds(row, col) || board[row][col] !== EMPTY) {
    return { combination: 'none', fours: 0, live_threes: 0 };
  }
  return describeMove(toCells(board), row, col, player);
}

/**
 * A move the static reading can settle before search: a five, a jump four,
 * a four-three, a double three, a continuous-four win, or the block of one.
 * @returns {{ row: number, col: number, reason: string } | null}
 */
export function findMasterTactic(board, player) {
  const cells = toCells(board);
  const opponent = OPPONENT[player];

  const ours = fiveMoves(cells, player);
  if (ours.length) return pack(bestIndex(cells, player, ours), 'five');

  const theirs = fiveMoves(cells, opponent);
  if (theirs.length === 1) return pack(theirs[0], 'block-five');
  if (theirs.length > 1) return pack(bestIndex(cells, player, theirs), 'block-five');

  const open = openFourMoves(cells, player);
  if (open.length) {
    const kind = open.some(item => item.open) ? 'open-four' : 'double-four';
    return pack(bestIndex(cells, player, open.map(item => item.index)), kind);
  }

  const fourThree = findFourThree(cells, player);
  if (fourThree.length) return pack(bestIndex(cells, player, fourThree), 'four-three');

  const doubleThree = findDoubleThree(cells, player, true);
  if (doubleThree.length) return pack(bestIndex(cells, player, doubleThree), 'double-three');

  const vcf = searchVcf(cells, player, VCF_DEPTH, { n: 0, cap: VCF_NODES });
  if (vcf) {
    return {
      row: (vcf.index / N) | 0,
      col: vcf.index % N,
      reason: 'vcf',
      line: vcf.line.map(index => [(index / N) | 0, index % N]),
    };
  }

  const theirOpen = openFourMoves(cells, opponent);
  if (theirOpen.length) {
    const kind = theirOpen.some(item => item.open) ? 'block-open-four' : 'block-double-four';
    return pack(bestIndex(cells, player, theirOpen.map(item => item.index)), kind);
  }

  const theirFourThree = findFourThree(cells, opponent);
  if (theirFourThree.length) {
    return pack(bestIndex(cells, player, theirFourThree), 'block-four-three');
  }

  const theirVcf = searchVcf(cells, opponent, VCF_DEPTH, { n: 0, cap: VCF_NODES });
  if (theirVcf) return pack(theirVcf.index, 'block-vcf');

  const theirDouble = findDoubleThree(cells, opponent, false);
  if (theirDouble.length) return pack(bestIndex(cells, player, theirDouble), 'block-double-three');

  return null;
}

// ── Opening book ──────────────────────────────────────────────────────────────

function openingStones(opening) {
  return [
    { row: CENTER, col: CENTER, player: BLACK },
    { row: opening.white[0], col: opening.white[1], player: WHITE },
    { row: opening.black[0], col: opening.black[1], player: BLACK },
  ];
}

function stonesOf(board) {
  const stones = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r][c] !== EMPTY) stones.push({ row: r, col: c, player: board[r][c] });
    }
  }
  return stones;
}

function dedupeNext(moves) {
  const seen = new Set();
  const out = [];
  for (const move of moves) {
    const key = `${move.row},${move.col}`;
    if (seen.has(key)) continue;
    if (!inBounds(move.row, move.col)) continue;
    seen.add(key);
    out.push(move);
  }
  return out;
}

function adjacentReplies() {
  const moves = [];
  for (const opening of OPENINGS) {
    for (let t = 0; t < 8; t++) {
      const [row, col] = placeSymmetry(t, opening.white[0], opening.white[1]);
      const orthogonal = Math.abs(row - CENTER) + Math.abs(col - CENTER) === 1;
      moves.push({
        row,
        col,
        name: orthogonal ? 'Direct opening' : 'Slanted opening',
        chinese: orthogonal ? '直指' : '斜指',
      });
    }
  }
  return dedupeNext(moves);
}

function thirdMoves(white) {
  const moves = [];
  for (const opening of OPENINGS) {
    for (let t = 0; t < 8; t++) {
      const [wr, wc] = toCanonical(t, white.row, white.col);
      if (wr !== opening.white[0] || wc !== opening.white[1]) continue;
      const [row, col] = placeSymmetry(t, opening.black[0], opening.black[1]);
      moves.push({ row, col, name: opening.name, chinese: opening.chinese });
    }
  }
  return dedupeNext(moves);
}

function matchOpenings(board) {
  const found = [];
  const seen = new Set();
  for (const opening of OPENINGS) {
    for (let t = 0; t < 8; t++) {
      const stones = openingStones(opening).map(stone => {
        const [row, col] = placeSymmetry(t, stone.row, stone.col);
        return { row, col, player: stone.player };
      });
      if (!stones.every(stone => board[stone.row][stone.col] === stone.player)) continue;
      if (seen.has(opening.id)) break;
      seen.add(opening.id);
      found.push({
        ...opening,
        recorded: stones.map(stone => pointName(stone.row, stone.col)).join(' '),
      });
      break;
    }
  }
  return found;
}

/**
 * The classical opening this position belongs to, and the recorded next
 * stones when the game is still on move 1, 2, or 3.
 *
 * `prescribe` means those next stones are the whole candidate list: the
 * search has nothing tactical to say yet, and the book does.
 * @returns {{ prescribe: boolean, label: string, opening: object | null,
 *   next: Array<{row: number, col: number, name: string, chinese: string}> } | null}
 */
export function lookupBook(board) {
  const stones = stonesOf(board);
  if (stones.length > 16) return null;

  if (stones.length === 0) {
    return {
      prescribe: true,
      label: 'Empty board. Every classical opening starts with black at the centre.',
      opening: null,
      next: [{ row: CENTER, col: CENTER, name: 'Centre', chinese: '天元' }],
    };
  }

  if (board[CENTER][CENTER] !== BLACK) return null;

  if (stones.length === 1) {
    return {
      prescribe: true,
      label: 'Black has played the centre. A classical white reply is adjacent: straight beside the centre starts a direct opening, diagonally beside it starts a slanted opening.',
      opening: null,
      next: adjacentReplies(),
    };
  }

  const whites = stones.filter(stone => stone.player === WHITE);
  const extraBlack = stones.filter(stone => stone.player === BLACK && !(stone.row === CENTER && stone.col === CENTER));
  if (stones.length === 2 && whites.length === 1 && extraBlack.length === 0) {
    const next = thirdMoves(whites[0]).filter(move => board[move.row][move.col] === EMPTY);
    if (next.length === 0) return null;
    const dr = Math.abs(whites[0].row - CENTER);
    const dc = Math.abs(whites[0].col - CENTER);
    const orthogonal = (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
    const slanted = dr === 1 && dc === 1;
    if (!orthogonal && !slanted) return null;
    return {
      prescribe: true,
      label: orthogonal
        ? 'The first two moves are a direct opening. Each book move is a recorded third stone and names the opening it begins.'
        : 'The first two moves are a slanted opening. Each book move is a recorded third stone and names the opening it begins.',
      opening: null,
      next,
    };
  }

  const matched = matchOpenings(board);
  if (matched.length !== 1) return null;
  const opening = matched[0];
  return {
    prescribe: false,
    label: `The position contains ${opening.name} (${opening.chinese}), a ${opening.family} opening, ${opening.balance}. Recorded stones: ${opening.recorded}. ${opening.idea}`,
    opening,
    next: [],
  };
}
