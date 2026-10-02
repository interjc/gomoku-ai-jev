/** Workers AI System One adapter. Inference always runs on Cloudflare. */
export function clefModel(difficulty) {
  const selector = difficulty === 'hard' || difficulty === 'master' ? 'clef' : 'clef-flash';
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

function readAnswer(response, criteria) {
  const answer = response?.answers?.move;
  if (!answer || !Object.hasOwn(criteria, answer.choice)
    || typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence)
    || answer.confidence < 0 || answer.confidence > 1) {
    throw new Error('Invalid Clef choice');
  }
  const probabilities = answer.probabilities;
  const keys = Object.keys(criteria);
  if (!probabilities || typeof probabilities !== 'object'
    || Object.keys(probabilities).length !== keys.length
    || keys.some(key => !Object.hasOwn(probabilities, key)
      || typeof probabilities[key] !== 'number' || !Number.isFinite(probabilities[key])
      || probabilities[key] < 0 || probabilities[key] > 1)
    || keys.reduce((sum, key) => sum + probabilities[key], 0) <= 0) {
    throw new Error('Invalid Clef probabilities');
  }
  return { choice: answer.choice, confidence: answer.confidence, probabilities };
}

export async function askClef(env, request, difficulty = request.state.difficulty) {
  const model = clefModel(difficulty);
  const { timeout } = readClefConfig(env);
  let timer;
  try {
    const response = await Promise.race([
      env.AI.run(model.id, {
        model: model.selector,
        state: request.state,
        questions: {
          move: { type: 'choice', instructions: request.instructions, criteria: request.criteria },
        },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Clef request timed out')), timeout);
      }),
    ]);
    return readAnswer(response, request.criteria);
  } finally {
    clearTimeout(timer);
  }
}
