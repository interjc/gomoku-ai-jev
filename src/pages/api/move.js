import { env } from 'cloudflare:workers';
import { handleMoveRequest } from '../../lib/move-api.js';

export const prerender = false;

export async function POST({ request }) {
  return handleMoveRequest(request, env);
}
