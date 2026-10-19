/** Server-side Jev inference through the Cloudflare AI binding. */
import { askWorkersAI } from '../workers-ai/ask.js';

export const JEV_MODEL = 'typesafe/jev-1.14.0';

export function readJevConfig(env = {}) {
  const minConfidence = Number(env.JEV_MIN_CONFIDENCE ?? 0.5);
  return {
    model: JEV_MODEL,
    minConfidence: Number.isFinite(minConfidence) ? minConfidence : 0.5,
  };
}

export async function askJev(env, request) {
  // Hard may ask twice in one turn, so keep each attempt short.
  return askWorkersAI(env, request, { model: JEV_MODEL, timeout: 6000, name: 'Jev' });
}
