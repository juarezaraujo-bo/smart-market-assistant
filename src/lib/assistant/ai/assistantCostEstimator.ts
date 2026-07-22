import type { AssistantAiContext } from './assistantContextBuilder';
import { getModelPricing } from './modelPricing';

export type AssistantCostEstimate = {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedInputCostUsd: number;
  estimatedOutputCostUsd: number;
  estimatedTotalCostUsd: number;
  pricingSource: 'configuration';
};

export type AssistantCostLimitResult =
  | { ok: true }
  | { ok: false; reason: 'input_tokens_limit' | 'output_tokens_limit' | 'estimated_cost_limit' };

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function roundUsd(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function envNumber(name: string) {
  const value = process.env[name];
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function estimateAssistantCost(input: {
  model: string;
  systemInstructions: string;
  prompt: string;
  context: AssistantAiContext;
  maxOutputTokens: number;
}): AssistantCostEstimate {
  const pricing = getModelPricing(input.model);
  const estimatedInputTokens = estimateTokens([
    input.systemInstructions,
    input.prompt,
    JSON.stringify(input.context),
  ].join('\n'));
  const estimatedOutputTokens = Math.max(1, Math.floor(input.maxOutputTokens));
  const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
  const estimatedInputCostUsd = roundUsd((estimatedInputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens);
  const estimatedOutputCostUsd = roundUsd((estimatedOutputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens);

  const estimate = {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedInputCostUsd,
    estimatedOutputCostUsd,
    estimatedTotalCostUsd: roundUsd(estimatedInputCostUsd + estimatedOutputCostUsd),
    pricingSource: 'configuration' as const,
  };

  if (Object.values(estimate).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) {
    throw new Error('invalid_cost_estimate');
  }

  return estimate;
}

export function validateAssistantCostLimits(estimate: AssistantCostEstimate): AssistantCostLimitResult {
  const maxInputTokens = envNumber('SMARTMARKET_AI_MAX_INPUT_TOKENS');
  const maxOutputTokens = envNumber('SMARTMARKET_AI_MAX_OUTPUT_TOKENS');
  const maxCost = envNumber('SMARTMARKET_AI_MAX_ESTIMATED_COST_USD');

  if (maxInputTokens !== null && estimate.estimatedInputTokens > maxInputTokens) {
    return { ok: false, reason: 'input_tokens_limit' };
  }
  if (maxOutputTokens !== null && estimate.estimatedOutputTokens > maxOutputTokens) {
    return { ok: false, reason: 'output_tokens_limit' };
  }
  if (maxCost !== null && estimate.estimatedTotalCostUsd > maxCost) {
    return { ok: false, reason: 'estimated_cost_limit' };
  }

  return { ok: true };
}
