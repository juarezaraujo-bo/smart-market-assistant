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

function describeSummary(request: LlmRequest) {
  const summary = request.context.analytics.summary;
  const first = request.context.analytics.recommendations[0];
  if (!summary) return describeTopRecommendation(request);

  return [
    `No periodo analisado, ha ${summary.criticas} prioridade(s) critica(s) e ${summary.altas} alta(s).`,
    `Capital estimado em risco: ${formatCurrencyPtBr(summary.capital_em_risco)}.`,
    first ? `Principal ponto de atencao: ${first.nome} - ${first.diagnostico}` : null,
    first ? `Proximo passo: ${getRecommendedActionLabel(first.acao_recomendada as RecommendedAction)}.` : null,
  ].filter(Boolean).join('\n');
}

function describeActionPlan(request: LlmRequest) {
  const recommendations = request.context.analytics.recommendations.slice(0, 3);
  if (recommendations.length === 0) return describeTopRecommendation(request);

  const actions = recommendations.map((item, index) =>
    `${index + 1}. ${item.nome}: ${getRecommendedActionLabel(item.acao_recomendada as RecommendedAction)}. Motivo: ${item.diagnostico}`
  );

  return [
    'Plano de acao sugerido com base nas prioridades atuais:',
    ...actions,
    'Indicador para acompanhar: estoque, cobertura estimada e capital em risco dos itens priorizados.',
  ].join('\n');
}

function describePromotionAdvice(request: LlmRequest) {
  const activeProductName = request.context.analytics.products[0]?.nome || request.context.conversation.activeProduct;
  const simulation = request.context.analytics.promotionSimulations.find((item) =>
    activeProductName ? item.produto === activeProductName : true
  );
  const recommendation = request.context.analytics.recommendations.find((item) =>
    item.acao_recomendada === 'CRIAR_PROMOCAO' &&
    (!activeProductName || item.nome === activeProductName)
  );
  if (!simulation && !recommendation) return 'Nao ha simulacao de promocao valida no contexto.';
  if (!simulation && recommendation) {
    return [
      `Nao ha simulacao de promocao valida para ${recommendation.nome}.`,
      'A recomendacao indica promocao, mas o contexto nao trouxe um cenario numerico vantajoso.',
      'Sem cenario valido, nao e seguro sugerir preco, desconto ou ganho economico.',
    ].join('\n');
  }

  return [
    `A promocao deve ser tratada como simulacao para ${simulation?.produto || recommendation?.nome}.`,
    simulation ? `Preco sugerido: ${formatCurrencyPtBr(simulation.preco_promocional)}.` : null,
    simulation ? `Desconto estimado: ${simulation.desconto_percentual}%.` : null,
    simulation ? `Ganho economico incremental estimado: ${formatCurrencyPtBr(simulation.ganho_economico_incremental)}.` : null,
    'Isso e uma projecao, nao uma garantia de venda ou lucro.',
  ].filter(Boolean).join('\n');
}

function describeInventoryAdvice(request: LlmRequest) {
  const product = request.context.analytics.products[0];
  if (!product) return describeTopRecommendation(request);

  return [
    `${product.nome}: analise de compra e reposicao.`,
    `Estoque: ${product.estoque_atual ?? 'nao informado'} unidade(s).`,
    `Vendas no periodo: ${product.quantidade_vendida ?? 'nao informado'} unidade(s).`,
    `Cobertura estimada: ${product.cobertura_dias ?? 'nao calculada'} dia(s).`,
    `Recomendacao: ${getRecommendedActionLabel(product.acao_recomendada as RecommendedAction)}.`,
    'Nao recomende compra se as vendas nao sustentarem a reposicao.',
  ].join('\n');
}

function createNormalResponse(request: LlmRequest) {
  const context = request.context;
  let body: string;

  if (request.metadata?.purpose === 'executive_summary') {
    body = describeSummary(request);
  } else if (request.metadata?.purpose === 'action_plan') {
    body = describeActionPlan(request);
  } else if (request.metadata?.purpose === 'promotion_advice') {
    body = describePromotionAdvice(request);
  } else if (request.metadata?.purpose === 'inventory_advice') {
    body = describeInventoryAdvice(request);
  } else if (request.metadata?.purpose === 'strategy') {
    body = describeTopRecommendation(request);
  } else {
    body = context.analytics.products.length > 0 ? describeProduct(request) : describeTopRecommendation(request);
  }

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
