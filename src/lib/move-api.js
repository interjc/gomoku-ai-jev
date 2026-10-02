/** Public move endpoint: accept only a complete, legal, unfinished Gomoku record. */
import { BOARD_SIZE, EMPTY, BLACK, WHITE, createBoard, checkWin } from './gomoku.js';
import { createProvider } from './providers.js';
import { chooseMove } from './jev/move.js';

const MAX_BODY_BYTES = 16 * 1024;
const FIELDS = ['board', 'player', 'history', 'difficulty', 'provider'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError('Content-Type must be application/json', 415);
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    throw new RequestError('Request body too large', 413);
  }
  if (!request.body) throw new RequestError('Invalid JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError('Request body too large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new RequestError('Invalid JSON');
  }
}

function validateGame(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !FIELDS.includes(key))) {
    throw new RequestError('Only Gomoku move fields are accepted');
  }
  const { board, history, player } = body;
  if (!Array.isArray(board) || board.length !== BOARD_SIZE
    || !board.every(row => Array.isArray(row) && row.length === BOARD_SIZE
      && row.every(cell => cell === EMPTY || cell === BLACK || cell === WHITE))) {
    throw new RequestError('Invalid board');
  }
  if (player !== BLACK && player !== WHITE) throw new RequestError('Invalid player');
  if (body.difficulty !== undefined && !['easy', 'medium', 'hard', 'master'].includes(body.difficulty)) {
    throw new RequestError('Invalid difficulty');
  }
  if (body.provider !== undefined && !['clef', 'jev'].includes(body.provider)) {
    throw new RequestError('Invalid provider');
  }
  if (!Array.isArray(history) || history.length > BOARD_SIZE * BOARD_SIZE) {
    throw new RequestError('Complete move history is required');
  }
  const replay = createBoard();
  for (const [index, move] of history.entries()) {
    if (!move || typeof move !== 'object' || Array.isArray(move)
      || Object.keys(move).length !== 3
      || Object.keys(move).some(key => !['row', 'col', 'player'].includes(key))
      || !Number.isInteger(move.row) || !Number.isInteger(move.col)
      || move.row < 0 || move.row >= BOARD_SIZE || move.col < 0 || move.col >= BOARD_SIZE
      || move.player !== (index % 2 === 0 ? BLACK : WHITE)) {
      throw new RequestError('Invalid move history');
    }
    if (replay[move.row][move.col] !== EMPTY) throw new RequestError('Duplicate move');
    replay[move.row][move.col] = move.player;
    if (checkWin(replay, move.row, move.col, move.player)) throw new RequestError('Game is already over');
  }
  if (!board.every((row, r) => row.every((cell, c) => cell === replay[r][c]))) {
    throw new RequestError('Board does not match move history');
  }
  if (history.length === BOARD_SIZE * BOARD_SIZE) throw new RequestError('Game is already over');
  if (player !== (history.length % 2 === 0 ? BLACK : WHITE)) throw new RequestError('Invalid turn');
}

export async function handleMoveRequest(request, env) {
  let body;
  let provider;
  try {
    body = await readBody(request);
    validateGame(body);
    provider = createProvider(env, body.provider, body.difficulty ?? 'hard');
  } catch (error) {
    return json({ error: error instanceof RequestError ? error.message : 'Provider unavailable' },
      error instanceof RequestError ? error.status : 400);
  }
  // All model instructions and candidate descriptions are built on the server.
  const move = await chooseMove({
    board: body.board, player: body.player, history: body.history,
    difficulty: body.difficulty ?? 'hard', minConfidence: provider.minConfidence,
    ask: provider.ask, source: provider.id ?? 'local',
  });
  const name = provider.id === 'jev' ? 'Jev'
    : provider.model === '@cf/cloudflare/clef' ? 'Clef' : 'Clef Flash';
  return json({ ...move, model: provider.id && move.source === provider.id ? name : null });
}
