import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProductRecommendation } from '../src/lib/analytics/productRecommendations';
import type { PromotionSimulation } from '../src/lib/analytics/promotionSimulator';
import {
  buildAnalysisSummary,
  buildPromotionInsight,
  buildSalesProjectionSummary,
  formatApproximateDays,
  formatSignedCurrencyPtBr,
  getPromotionUnavailableMessage,
} from '../src/lib/analytics/promotionPresentation';

function makeSimulation(overrides: Partial<PromotionSimulation> = {}): PromotionSimulation {
  return {
    tipo: 'simulacao_promocao',
    aviso: 'Simulação baseada no histórico recente de vendas e em parâmetros estimados.',
    disponivel: true,
    motivo_indisponibilidade: null,
    preco_venda_atual: 9.99,
    preco_custo: 6,
    estoque_atual: 24,
    venda_media_dia: 0.061,
    dias_de_simulacao: 240,
    margem_bruta_atual_percentual: 39.94,
    lucro_bruto_unitario_atual: 3.99,
    capital_em_estoque: 144,
    venda_base_estimada: 14,
    estoque_estimado_sem_promocao: 10,
    capital_em_risco_estimado_sem_promocao: 60,
    lucro_bruto_base: 55.86,
    resultado_economico_estimado_sem_promocao: -4.14,
    melhor_cenario: {
      desconto_percentual: 20,
      aumento_velocidade_percentual_estimado: 70,
      preco_promocional: 7.99,
      margem_bruta_promocional_percentual: 24.91,
      lucro_bruto_unitario_promocional: 1.99,
      venda_promocional_estimada: 24,
      estoque_estimado_com_promocao: 0,
      capital_em_risco_estimado_com_promocao: 0,
      reducao_capital_risco_valor: 60,
      reducao_capital_risco_percentual: 100,
      receita_promocional_estimada: 191.76,
      lucro_bruto_promocional: 47.76,
      resultado_economico_estimado_com_promocao: 47.76,
      ganho_economico_incremental: 51.9,
      valido: true,
    },
    cenarios_avaliados: [],
    ...overrides,
  };
}

function makeRecommendation(simulation = makeSimulation()): ProductRecommendation {
  return {
    produto_id: 'produto-1',
    nome: 'Molho Premium 300g',
    categoria: 'Mercearia',
    prioridade_score: 82,
    severidade: 'media',
    recomendacao_principal: 'RISCO_VENCIMENTO',
    diagnostico: 'Produto pode sobrar antes do vencimento.',
    impacto: 'Capital parado relevante.',
    acao_recomendada: 'CRIAR_PROMOCAO',
    justificativas: [],
    metricas_relevantes: {
      quantidade_vendida: 11,
      dias_periodo: 180,
      dias_ate_vencimento: 240,
      cobertura_dias: 394.91,
    },
    simulacao_promocao: simulation,
  };
}

test('separa histórico e projeção sem usar média diária na apresentação', () => {
  const summary = buildSalesProjectionSummary(makeRecommendation(), 'Janeiro de 2026 até Junho de 2026');

  assert.equal(summary.historico.intervalo, 'Janeiro de 2026 até Junho de 2026');
  assert.equal(summary.historico.duracao, '6 meses analisados');
  assert.equal(summary.historico.vendasRealizadas, '11 unidades');
  assert.equal(summary.historico.mediaMensal, '2 unidades por mês');
  assert.equal(summary.projecao.diasAteVencimento, '240 dias');
  assert.equal(summary.projecao.vendaEstimada, '14 unidades');
  assert.equal(summary.projecao.estoqueRestante, '10 unidades');
  assert.equal(summary.projecao.capitalParado, 'R$\u00a060,00');
  assert.equal(JSON.stringify(summary).includes('/dia'), false);
});

test('arredonda cobertura apenas para apresentação', () => {
  assert.equal(formatApproximateDays(394.91), 'aproximadamente 395 dias');
  assert.equal(formatApproximateDays(95.53), 'aproximadamente 96 dias');
  assert.equal(formatApproximateDays(57.16, true), '≈ 57 dias');
});

test('insight usa estoque restante e projeção da promoção', () => {
  const insight = buildPromotionInsight(makeSimulation());

  assert.match(insight, /10 das 24 unidades/);
  assert.match(insight, /promoção próxima de 20%/);
  assert.match(insight, /praticamente todo o estoque/);
});

test('resumo dinâmico explica situação sem repetir termos técnicos', () => {
  const summary = buildAnalysisSummary(makeSimulation());

  assert.match(summary, /Você possui 24 unidades em estoque/);
  assert.match(summary, /aproximadamente 14 unidades devem ser vendidas/);
  assert.match(summary, /R\$\u00a060,00 em custo/);
  assert.match(summary, /promoção de aproximadamente 20%/);
});

test('formata impacto financeiro positivo com sinal', () => {
  assert.equal(formatSignedCurrencyPtBr(51.95), '+ R$\u00a051,95');
});

test('mensagens sem simulação distinguem ausência de vendas e cenário não vantajoso', () => {
  const noSales = makeSimulation({
    disponivel: false,
    motivo_indisponibilidade: 'Não há vendas suficientes no período para estimar o efeito da promoção.',
    melhor_cenario: null,
  });
  const noAdvantage = makeSimulation({
    disponivel: false,
    motivo_indisponibilidade: 'Nenhum cenário promocional vantajoso foi encontrado.',
    melhor_cenario: null,
  });

  assert.equal(
    getPromotionUnavailableMessage(noSales),
    'Não há histórico de vendas suficiente para estimar com segurança o impacto de uma promoção.'
  );
  assert.match(getPromotionUnavailableMessage(noAdvantage), /Nenhuma promoção simulada apresentou benefício financeiro suficiente/);
});
