/** Workers AI System One adapter. Inference always runs on Cloudflare. */
export function clefModel(difficulty) {
  const selector = difficulty === 'master' ? 'clef' : 'clef-flash';
  return { id: `@cf/cloudflare/${selector}`, selector };
}

export function readClefConfig(env = {}) {
  const floor = Number(env.CLEF_MIN_CONFIDENCE ?? 0);
  const timeout = Number(env.CLEF_TIMEOUT_MS ?? 6000);
  return {
    minConfidence: Number.isFinite(floor) && floor >= 0 && floor <= 1 ? floor : 0,
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 6000,
  };
}

function readAnswer(response, criteria, name) {
  const answer = response?.answers?.move;
  if (!answer || !Object.hasOwn(criteria, answer.choice)
    || typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence)
    || answer.confidence < 0 || answer.confidence > 1) {
    throw new Error(`Invalid ${name} choice`);
  }
  const probabilities = answer.probabilities;
  const keys = Object.keys(criteria);
  if (!probabilities || typeof probabilities !== 'object'
    || Object.keys(probabilities).length !== keys.length
    || keys.some(key => !Object.hasOwn(probabilities, key)
      || typeof probabilities[key] !== 'number' || !Number.isFinite(probabilities[key])
      || probabilities[key] < 0 || probabilities[key] > 1)
    || keys.reduce((sum, key) => sum + probabilities[key], 0) <= 0) {
    throw new Error(`Invalid ${name} probabilities`);
  }
  return { choice: answer.choice, confidence: answer.confidence, probabilities };
}

export async function askClef(env, request, difficulty = request.state.difficulty) {
  const model = clefModel(difficulty);
  const { timeout } = readClefConfig(env);
  return askWorkersAI(env, request, { model: model.id, selector: model.selector, timeout, name: 'Clef' });
}

/** Shared System One transport for Clef and Jev through the AI binding. */
export async function askWorkersAI(env, request, { model, selector, timeout, name }) {
  let timer;
  try {
    const response = await Promise.race([
      env.AI.run(model, {
        ...(selector ? { model: selector } : {}),
        state: request.state,
        questions: {
          move: { type: 'choice', instructions: request.instructions, criteria: request.criteria },
        },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name} request timed out`)), timeout);
      }),
    ]);
    return readAnswer(response, request.criteria, name);
  } finally {
    clearTimeout(timer);
  }
}
