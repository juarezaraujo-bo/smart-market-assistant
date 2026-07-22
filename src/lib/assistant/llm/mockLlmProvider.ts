import {
  formatCurrencyPtBr,
  getRecommendedActionLabel,
} from '@/lib/analytics/recommendationLabels';
import type { RecommendedAction } from '@/lib/analytics/productRecommendations';
import type { LlmProvider, LlmRequest, LlmResponse } from './llmProvider';

export type MockLlmMode = 'normal' | 'timeout' | 'error' | 'empty' | 'unsafe';

function getMockMode(): MockLlmMode {
  const value = process.env.SMARTMARKET_MOCK_LLM_MODE;
  if (value === 'timeout' || value === 'error' || value === 'empty' || value === 'unsafe') return value;
  return 'normal';
}

function describeTopRecommendation(request: LlmRequest) {
  const recommendation = request.context.analytics.recommendations[0];
  if (!recommendation) return 'Não há recomendações suficientes no contexto para explicar.';

  const parts = [
    `A prioridade principal é ${recommendation.nome}.`,
    recommendation.diagnostico ? `Motivo: ${recommendation.diagnostico}` : null,
    recommendation.impacto ? `Impacto: ${recommendation.impacto}` : null,
    recommendation.acao_recomendada ? `Ação recomendada: ${getRecommendedActionLabel(recommendation.acao_recomendada as RecommendedAction)}.` : null,
  ].filter(Boolean);

  return parts.join('\n');
}

function describeProduct(request: LlmRequest) {
  const product = request.context.analytics.products[0];
  if (!product) return describeTopRecommendation(request);

  const parts = [
    `${product.nome} foi analisado com os dados do período informado.`,
    product.diagnostico ? `Motivo: ${product.diagnostico}` : null,
    product.impacto ? `Impacto: ${product.impacto}` : null,
    product.acao_recomendada ? `Ação recomendada: ${getRecommendedActionLabel(product.acao_recomendada as RecommendedAction)}.` : null,
    product.capital_estoque !== null && product.capital_estoque !== undefined
      ? `Capital em estoque: ${formatCurrencyPtBr(product.capital_estoque)}.`
      : null,
  ].filter(Boolean);

  return parts.join('\n');
}

function createNormalResponse(request: LlmRequest) {
  const context = request.context;
  const shouldUseRecommendationList = request.metadata?.purpose === 'strategy' || request.metadata?.purpose === 'inventory_advice';
  const body = !shouldUseRecommendationList && context.analytics.products.length > 0
    ? describeProduct(request)
    : describeTopRecommendation(request);

  return [
    `Período: ${context.period.label}`,
    '',
    body,
    '',
    'Esta é uma projeção explicativa baseada somente nos dados fornecidos. O resultado real pode variar.',
  ].join('\n').trim();
}

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const mode = getMockMode();

    if (mode === 'timeout') {
      throw new Error('mock_timeout');
    }

    if (mode === 'error') {
      throw new Error('mock_error');
    }

    if (mode === 'empty') {
      return {
        text: '',
        model: request.metadata?.model || 'smartmarket-mock',
        finishReason: 'mock_empty',
      };
    }

    if (mode === 'unsafe') {
      return {
        text: 'select * from produtos where cliente_id = "00000000-0000-0000-0000-000000000000";',
        model: request.metadata?.model || 'smartmarket-mock',
        finishReason: 'mock_unsafe',
      };
    }

    const text = createNormalResponse(request);
    const outputTokens = Math.max(1, Math.ceil(text.length / 4));

    return {
      text,
      model: request.metadata?.model || 'smartmarket-mock',
      usage: {
        inputTokens: Math.max(1, Math.ceil(JSON.stringify(request.context).length / 4)),
        outputTokens,
        totalTokens: outputTokens + Math.max(1, Math.ceil(JSON.stringify(request.context).length / 4)),
      },
      finishReason: 'mock_complete',
    };
  }
}
