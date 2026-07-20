import test from 'node:test';
import assert from 'node:assert/strict';
import {
  simulatePromotion,
  type PromotionSimulationInput,
  type PromotionSimulation,
} from '../src/lib/analytics/promotionSimulator';
import {
  generateProductRecommendations,
} from '../src/lib/analytics/productRecommendations';
import type { ProductMetrics } from '../src/lib/analytics/productMetrics';
import type { PromotionSimulationConfig } from '../src/lib/analytics/recommendationConfig';

function makeInput(overrides: Partial<PromotionSimulationInput> = {}): PromotionSimulationInput {
  return {
    preco_venda_atual: 10,
    preco_custo: 4,
    estoque_atual: 20,
    venda_media_dia: 0.5,
    dias_ate_vencimento: 30,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<PromotionSimulationConfig> = {}): PromotionSimulationConfig {
  return {
    margemMinimaPercentual: 10,
    descontoMaximoPercentual: 25,
    horizontePadraoDias: 30,
    cenarios: [
      { descontoPercentual: 5, aumentoVelocidadePercentual: 10 },
      { descontoPercentual: 10, aumentoVelocidadePercentual: 25 },
      { descontoPercentual: 15, aumentoVelocidadePercentual: 45 },
      { descontoPercentual: 20, aumentoVelocidadePercentual: 70 },
      { descontoPercentual: 25, aumentoVelocidadePercentual: 100 },
    ],
    ...overrides,
  };
}

function makeMetric(overrides: Partial<ProductMetrics> = {}): ProductMetrics {
  return {
    produto_id: 'produto-1',
    nome: 'Produto Teste',
    categoria: 'Categoria',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 5,
    estoque_atual: 20,
    preco_custo: 4,
    preco_venda: 10,
    dias_periodo: 30,
    venda_media_dia: 0.5,
    cobertura_dias: 40,
    capital_estoque: 80,
    margem_unitaria: 6,
    margem_percentual: 60,
    dias_sem_venda: 2,
    dias_ate_vencimento: 30,
    variacao_vendas_percentual: -30,
    tendencia_vendas: 'queda',
    observacoes: [],
    ...overrides,
  };
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasInvalidNumber);
  return false;
}

function assertNoInvalidNumbers(simulation: PromotionSimulation) {
  assert.equal(hasInvalidNumber(simulation), false);
}

function recommendationsFor(target: ProductMetrics, others: ProductMetrics[] = []) {
  return generateProductRecommendations([
    target,
    makeMetric({ produto_id: 'baixo-1', nome: 'Baixo 1', capital_estoque: 10, quantidade_vendida: 1, cobertura_dias: 20 }),
    makeMetric({ produto_id: 'baixo-2', nome: 'Baixo 2', capital_estoque: 20, quantidade_vendida: 2, cobertura_dias: 20 }),
    makeMetric({ produto_id: 'baixo-3', nome: 'Baixo 3', capital_estoque: 30, quantidade_vendida: 3, cobertura_dias: 20 }),
    makeMetric({ produto_id: 'baixo-4', nome: 'Baixo 4', capital_estoque: 40, quantidade_vendida: 4, cobertura_dias: 20 }),
    ...others,
  ]);
}

test('simulacao indisponivel quando venda media e zero', () => {
  const simulation = simulatePromotion(makeInput({ venda_media_dia: 0 }));

  assert.equal(simulation.disponivel, false);
  assert.equal(simulation.melhor_cenario, null);
  assert.equal(simulation.motivo_indisponibilidade, 'Não há vendas suficientes no período para estimar o efeito da promoção.');
});

test('rejeita preco promocional abaixo ou igual ao custo', () => {
  const simulation = simulatePromotion(makeInput({ preco_venda_atual: 5, preco_custo: 4.8 }));

  assert.equal(simulation.melhor_cenario, null);
  assert.equal(simulation.cenarios_avaliados.every((scenario) => !scenario.valido), true);
  assert.equal(simulation.cenarios_avaliados.some((scenario) => scenario.motivo_rejeicao?.includes('custo')), true);
});

test('rejeita cenario por margem minima', () => {
  const simulation = simulatePromotion(makeInput({ preco_venda_atual: 10, preco_custo: 8.6 }));

  assert.equal(simulation.melhor_cenario, null);
  assert.equal(simulation.cenarios_avaliados.some((scenario) => scenario.motivo_rejeicao?.includes('Margem')), true);
});

test('respeita desconto maximo configurado', () => {
  const simulation = simulatePromotion(makeInput(), makeConfig({
    descontoMaximoPercentual: 10,
    cenarios: [
      { descontoPercentual: 10, aumentoVelocidadePercentual: 25 },
      { descontoPercentual: 15, aumentoVelocidadePercentual: 80 },
    ],
  }));

  const rejected = simulation.cenarios_avaliados.find((scenario) => scenario.desconto_percentual === 15);
  assert.equal(rejected?.valido, false);
  assert.equal(rejected?.motivo_rejeicao, 'Desconto acima do limite configurado.');
});

test('cenario promocional precisa superar a venda base', () => {
  const simulation = simulatePromotion(makeInput(), makeConfig({
    cenarios: [{ descontoPercentual: 5, aumentoVelocidadePercentual: 0 }],
  }));

  assert.equal(simulation.melhor_cenario, null);
  assert.equal(simulation.cenarios_avaliados[0].motivo_rejeicao, 'Venda promocional estimada não supera a venda base.');
});

test('cenario precisa reduzir capital em risco', () => {
  const simulation = simulatePromotion(makeInput({
    preco_custo: 0,
    estoque_atual: 20,
    venda_media_dia: 0.5,
    dias_ate_vencimento: 30,
  }));

  assert.equal(simulation.melhor_cenario, null);
  assert.equal(simulation.cenarios_avaliados.some((scenario) => scenario.motivo_rejeicao?.includes('capital em risco')), true);
});

test('cenario precisa ter ganho economico incremental positivo', () => {
  const simulation = simulatePromotion(makeInput(), makeConfig({
    cenarios: [{ descontoPercentual: 25, aumentoVelocidadePercentual: 100 }],
  }));

  assert.equal(simulation.melhor_cenario, null);
  assert.equal(simulation.cenarios_avaliados[0].motivo_rejeicao, 'Ganho econômico incremental estimado não é positivo.');
});

test('escolhe maior ganho economico incremental antes de maior desconto', () => {
  const simulation = simulatePromotion(makeInput());

  assert.equal(simulation.melhor_cenario?.desconto_percentual, 15);
  assert.notEqual(simulation.melhor_cenario?.desconto_percentual, 25);
  assert.equal(simulation.melhor_cenario?.ganho_economico_incremental, 20);
});

test('desempata por maior reducao de risco', () => {
  const simulation = simulatePromotion(
    makeInput({ preco_custo: 2, estoque_atual: 100, venda_media_dia: 1, dias_ate_vencimento: 10 }),
    makeConfig({
      cenarios: [
        { descontoPercentual: 20, aumentoVelocidadePercentual: 50 },
        { descontoPercentual: 25, aumentoVelocidadePercentual: 60 },
      ],
    })
  );

  assert.equal(simulation.melhor_cenario?.desconto_percentual, 25);
  assert.equal(simulation.melhor_cenario?.reducao_capital_risco_valor, 12);
});

test('desempata por maior margem promocional', () => {
  const simulation = simulatePromotion(
    makeInput({ estoque_atual: 100, venda_media_dia: 1, dias_ate_vencimento: 10 }),
    makeConfig({
      cenarios: [
        { descontoPercentual: 10.04, aumentoVelocidadePercentual: 50 },
        { descontoPercentual: 10, aumentoVelocidadePercentual: 50 },
      ],
    })
  );

  assert.equal(simulation.melhor_cenario?.desconto_percentual, 10);
});

test('desempata por menor desconto quando ganho risco e margem arredondados empatam', () => {
  const simulation = simulatePromotion(
    makeInput({ estoque_atual: 100, venda_media_dia: 1, dias_ate_vencimento: 10 }),
    makeConfig({
      cenarios: [
        { descontoPercentual: 10.004, aumentoVelocidadePercentual: 50 },
        { descontoPercentual: 10, aumentoVelocidadePercentual: 50 },
      ],
    })
  );

  assert.equal(simulation.melhor_cenario?.desconto_percentual, 10);
});

test('arredonda unidades estimadas de forma conservadora', () => {
  const simulation = simulatePromotion(makeInput({ estoque_atual: 30, venda_media_dia: 0.33, dias_ate_vencimento: 10 }));

  assert.equal(simulation.venda_base_estimada, 3);
  assert.equal(simulation.cenarios_avaliados.every((scenario) => Number.isInteger(scenario.venda_promocional_estimada)), true);
});

test('nao retorna NaN ou Infinity', () => {
  const simulation = simulatePromotion(makeInput({ preco_venda_atual: 0, preco_custo: 0, venda_media_dia: null }));

  assertNoInvalidNumbers(simulation);
});

test('nao retorna unidades ou estoques negativos', () => {
  const simulation = simulatePromotion(makeInput({ estoque_atual: -5, venda_media_dia: 10 }));

  assert.equal(simulation.estoque_atual, 0);
  assert.equal(simulation.venda_base_estimada >= 0, true);
  assert.equal(simulation.estoque_estimado_sem_promocao >= 0, true);
});

test('nao simula acoes diferentes de CRIAR_PROMOCAO', () => {
  const recommendations = recommendationsFor(makeMetric({
    produto_id: 'ruptura',
    nome: 'Ruptura',
    cobertura_dias: 5,
    tendencia_vendas: 'crescimento',
    variacao_vendas_percentual: 30,
  }));
  const recommendation = recommendations.find((item) => item.produto_id === 'ruptura');

  assert.equal(recommendation?.acao_recomendada, 'REPOR_ESTOQUE');
  assert.equal(recommendation?.simulacao_promocao, null);
});

test('anexa simulacao somente para CRIAR_PROMOCAO', () => {
  const recommendations = recommendationsFor(makeMetric({
    produto_id: 'promo',
    nome: 'Promo',
    dias_ate_vencimento: 30,
    cobertura_dias: 40,
  }));
  const recommendation = recommendations.find((item) => item.produto_id === 'promo');

  assert.equal(recommendation?.acao_recomendada, 'CRIAR_PROMOCAO');
  assert.equal(recommendation?.simulacao_promocao?.tipo, 'simulacao_promocao');
});

test('preserva score e ordenacao das recomendacoes', () => {
  const before = generateProductRecommendations([
    makeMetric({ produto_id: 'a', nome: 'A', dias_ate_vencimento: 30, cobertura_dias: 40 }),
    makeMetric({ produto_id: 'b', nome: 'B', cobertura_dias: 5, tendencia_vendas: 'crescimento', variacao_vendas_percentual: 30 }),
    makeMetric({ produto_id: 'c', nome: 'C', quantidade_vendida: 0, venda_media_dia: 0, cobertura_dias: null }),
  ]).map((item) => ({
    id: item.produto_id,
    score: item.prioridade_score,
    principal: item.recomendacao_principal,
    acao: item.acao_recomendada,
  }));

  const after = generateProductRecommendations([
    makeMetric({ produto_id: 'a', nome: 'A', dias_ate_vencimento: 30, cobertura_dias: 40 }),
    makeMetric({ produto_id: 'b', nome: 'B', cobertura_dias: 5, tendencia_vendas: 'crescimento', variacao_vendas_percentual: 30 }),
    makeMetric({ produto_id: 'c', nome: 'C', quantidade_vendida: 0, venda_media_dia: 0, cobertura_dias: null }),
  ]).map((item) => ({
    id: item.produto_id,
    score: item.prioridade_score,
    principal: item.recomendacao_principal,
    acao: item.acao_recomendada,
  }));

  assert.deepEqual(after, before);
});
