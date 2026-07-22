export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'smartmarket-mock': {
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
  },
  'gpt-5.6-mini': {
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
  },
};

function envNumber(name: string) {
  const value = process.env[name];
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getModelPricing(model: string): ModelPricing {
  const envInput = envNumber('SMARTMARKET_AI_INPUT_USD_PER_MILLION_TOKENS');
  const envOutput = envNumber('SMARTMARKET_AI_OUTPUT_USD_PER_MILLION_TOKENS');
  if (envInput !== null && envOutput !== null) {
    return {
      inputUsdPerMillionTokens: envInput,
      outputUsdPerMillionTokens: envOutput,
    };
  }

  const pricing = DEFAULT_MODEL_PRICING[model];
  if (!pricing) {
    throw new Error('model_pricing_not_configured');
  }

  return pricing;
}
