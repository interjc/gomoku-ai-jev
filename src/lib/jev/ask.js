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
    timeout: 8000,
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
  };
}
