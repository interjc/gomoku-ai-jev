/**
 * Server-side Jev call. The API key is read from the Worker env, never from the browser.
 */

import { TypeSafeClient, choice } from '@typesafe-ai/sdk';

export function readJevConfig(env = {}) {
  const apiKey = String(env.TYPESAFE_API_KEY ?? '').trim();
  const minConfidence = Number(env.JEV_MIN_CONFIDENCE ?? 0.5);
  return {
    apiKey,
    baseURL: env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai',
    model: env.TYPESAFE_DEFAULT_MODEL || 'jev-latest',
    minConfidence: Number.isFinite(minConfidence) ? minConfidence : 0.5,
  };
}

export async function askJev(env, request) {
  const { apiKey, baseURL, model } = readJevConfig(env);
  const client = new TypeSafeClient({
    apiKey,
    baseURL,
    defaultModel: model,
    // Hard may ask twice in one turn, so keep a single attempt short.
    timeout: 6000,
    retry: { maxRetries: 1 },
  });
  const { answers } = await client.systemOne({
    model,
    state: request.state,
    questions: {
      move: choice(request.instructions, request.criteria),
    },
  });
  return {
    choice: answers.move.choice,
    confidence: answers.move.confidence,
    // The full distribution, not just the pick: hard blends it with the
    // search ranking instead of taking the single top label.
    probabilities: answers.move.probabilities,
  };
}
