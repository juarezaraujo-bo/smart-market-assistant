import { getAssistantModel } from '../openaiClient';
import { MockLlmProvider } from './mockLlmProvider';
import { OpenAiLlmProvider } from './openAiLlmProvider';
import type { LlmProvider } from './llmProvider';

export type LlmProviderSelection =
  | { ok: true; provider: LlmProvider; model: string; name: 'mock' | 'openai' }
  | { ok: false; reason: 'provider_not_configured' | 'openai_key_missing' | 'unknown_provider'; model: string | null };

export function getAssistantLlmProvider(): LlmProviderSelection {
  const configuredProvider = process.env.SMARTMARKET_LLM_PROVIDER;

  if (!configuredProvider) {
    return {
      ok: false,
      reason: 'provider_not_configured',
      model: null,
    };
  }

  if (configuredProvider === 'mock') {
    return {
      ok: true,
      provider: new MockLlmProvider(),
      model: process.env.SMARTMARKET_MOCK_MODEL || 'smartmarket-mock',
      name: 'mock',
    };
  }

  if (configuredProvider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      return {
        ok: false,
        reason: 'openai_key_missing',
        model: getAssistantModel(),
      };
    }

    return {
      ok: true,
      provider: new OpenAiLlmProvider(),
      model: getAssistantModel(),
      name: 'openai',
    };
  }

  return {
    ok: false,
    reason: 'unknown_provider',
    model: null,
  };
}
