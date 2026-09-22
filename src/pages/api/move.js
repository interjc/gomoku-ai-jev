import { env } from 'cloudflare:workers';

import { BOARD_SIZE, EMPTY, BLACK, WHITE } from '../../lib/gomoku.js';
import { askJev, readJevConfig } from '../../lib/jev/ask.js';
import { chooseMove } from '../../lib/jev/move.js';

export const prerender = false;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function validBoard(board) {
  if (!Array.isArray(board) || board.length !== BOARD_SIZE) return false;
  return board.every(row =>
    Array.isArray(row)
    && row.length === BOARD_SIZE
    && row.every(cell => cell === EMPTY || cell === BLACK || cell === WHITE),
  );
}

export async function POST({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!validBoard(body?.board)) return json({ error: 'Invalid board' }, 400);
  if (body.player !== BLACK && body.player !== WHITE) {
    return json({ error: 'Invalid player' }, 400);
  }

  const difficulty = ['easy', 'medium', 'hard'].includes(body.difficulty)
    ? body.difficulty
    : 'hard';
  const config = readJevConfig(env);
  const ask = config.apiKey ? (jevRequest) => askJev(env, jevRequest) : null;
  const move = await chooseMove({
    board: body.board,
    player: body.player,
    difficulty,
    history: body.history,
    minConfidence: config.minConfidence,
    ask,
  });

  return json(move);
}
