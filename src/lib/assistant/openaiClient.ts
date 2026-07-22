import OpenAI from 'openai';

const DEFAULT_TIMEOUT_MS = 25000;

export function isSmartMarketAiEnabled() {
  return process.env.SMARTMARKET_AI_ENABLED === 'true';
}

export function getAssistantModel() {
  return process.env.OPENAI_MODEL || 'gpt-5.6-mini';
}

export function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY nao configurada.');
  }

  return new OpenAI({
    apiKey,
    timeout: Number(process.env.SMARTMARKET_AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    maxRetries: 1,
  });
}

export function sanitizeOpenAIError(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: number }).status);
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'openai_unavailable';
  }

  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  return 'openai_error';
}
