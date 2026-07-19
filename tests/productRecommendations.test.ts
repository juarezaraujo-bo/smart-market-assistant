import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateProductRecommendation,
  generateProductRecommendations,
  getRecommendationSeverity,
  summarizeProductRecommendations,
  type ProductRecommendation,
} from '../src/lib/analytics/productRecommendations';
import type { ProductMetrics } from '../src/lib/analytics/productMetrics';

function makeMetric(overrides: Partial<ProductMetrics> = {}): ProductMetrics {
  return {
    produto_id: 'produto-1',
    nome: 'Produto Teste',
    categoria: 'Categoria',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 30,
    estoque_atual: 30,
    preco_custo: 4,
    preco_venda: 10,
    dias_periodo: 30,
    venda_media_dia: 1,
    cobertura_dias: 30,
    capital_estoque: 120,
    margem_unitaria: 6,
    margem_percentual: 60,
    dias_sem_venda: 2,
    dias_ate_vencimento: 120,
    variacao_vendas_percentual: 0,
    tendencia_vendas: 'estavel',
    observacoes: [],
    ...overrides,
  };
}

function withContext(target: ProductMetrics, others: ProductMetrics[] = []) {
  return [
    target,
    makeMetric({ produto_id: 'baixo-1', nome: 'Baixo 1', capital_estoque: 10, quantidade_vendida: 1 }),
    makeMetric({ produto_id: 'baixo-2', nome: 'Baixo 2', capital_estoque: 20, quantidade_vendida: 2 }),
    makeMetric({ produto_id: 'baixo-3', nome: 'Baixo 3', capital_estoque: 30, quantidade_vendida: 3 }),
    makeMetric({ produto_id: 'baixo-4', nome: 'Baixo 4', capital_estoque: 40, quantidade_vendida: 4 }),
    ...others,
  ];
}

function recommend(target: ProductMetrics, others: ProductMetrics[] = []) {
  return generateProductRecommendation(target, withContext(target, others));
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasInvalidNumber);
  return false;
}

function assertMain(recommendation: ProductRecommendation, expected: ProductRecommendation['recomendacao_principal']) {
  assert.equal(recommendation.recomendacao_principal, expected);
  assert.equal(typeof recommendation.recomendacao_principal, 'string');
}

test('produto vencido tem precedencia critica', () => {
  const recommendation = recommend(makeMetric({ dias_ate_vencimento: -1, quantidade_vendida: 0, cobertura_dias: null }));

  assertMain(recommendation, 'PRODUTO_VENCIDO');
  assert.equal(recommendation.acao_recomendada, 'RETIRAR_PRODUTO_VENCIDO');
  assert.equal(recommendation.prioridade_score, 100);
  assert.equal(recommendation.severidade, 'critica');
});

test('risco de vencimento recomenda promocao antes do vencimento', () => {
  const recommendation = recommend(makeMetric({ dias_ate_vencimento: 10, cobertura_dias: 20 }));

  assertMain(recommendation, 'RISCO_VENCIMENTO');
  assert.equal(recommendation.acao_recomendada, 'CRIAR_PROMOCAO');
});

test('venda zero com estoque suspende reposicao', () => {
  const recommendation = recommend(makeMetric({
    quantidade_vendida: 0,
    venda_media_dia: 0,
    cobertura_dias: null,
    estoque_atual: 24,
    capital_estoque: 144,
  }));

  assertMain(recommendation, 'SEM_VENDAS');
  assert.equal(recommendation.acao_recomendada, 'SUSPENDER_REPOSICAO');
});

test('venda zero sem estoque nao recomenda reposicao automaticamente', () => {
  const recommendation = recommend(makeMetric({
    quantidade_vendida: 0,
    venda_media_dia: 0,
    cobertura_dias: null,
    estoque_atual: 0,
    capital_estoque: 0,
  }));

  assertMain(recommendation, 'MONITORAR');
  assert.notEqual(recommendation.acao_recomendada, 'REPOR_ESTOQUE');
});

test('ruptura com crescimento prioriza reposicao', () => {
  const recommendation = recommend(makeMetric({
    cobertura_dias: 5,
    tendencia_vendas: 'crescimento',
    variacao_vendas_percentual: 30,
  }));

  assertMain(recommendation, 'RISCO_RUPTURA');
  assert.equal(recommendation.acao_recomendada, 'REPOR_ESTOQUE');
});

test('cobertura entre 7 e 15 dias gera reposicao prioritaria quando ha crescimento', () => {
  const recommendation = recommend(makeMetric({
    cobertura_dias: 10,
    tendencia_vendas: 'crescimento',
    variacao_vendas_percentual: 25,
  }));

  assertMain(recommendation, 'REPOSICAO_PRIORITARIA');
});

test('cobertura acima de 60 dias indica excesso de estoque', () => {
  const recommendation = recommend(makeMetric({ cobertura_dias: 70 }));

  assertMain(recommendation, 'EXCESSO_ESTOQUE');
  assert.equal(recommendation.justificativas.some((item) => item.codigo === 'EXCESSO_COBERTURA'), true);
});

test('cobertura acima de 90 dias aumenta prioridade por excesso muito alto', () => {
  const recommendation = recommend(makeMetric({ cobertura_dias: 100 }));

  assertMain(recommendation, 'EXCESSO_ESTOQUE');
  assert.equal(recommendation.justificativas.some((item) => item.codigo === 'COBERTURA_MUITO_EXCESSIVA'), true);
});

test('queda com excesso de estoque recomenda promocao em vez de reposicao', () => {
  const recommendation = recommend(makeMetric({
    cobertura_dias: 96,
    tendencia_vendas: 'queda',
    variacao_vendas_percentual: -30,
  }));

  assertMain(recommendation, 'EXCESSO_ESTOQUE');
  assert.equal(recommendation.acao_recomendada, 'CRIAR_PROMOCAO');
});

test('crescimento saudavel nao vira alerta negativo', () => {
  const recommendation = recommend(makeMetric({
    cobertura_dias: 35,
    tendencia_vendas: 'crescimento',
    variacao_vendas_percentual: 25,
  }));

  assertMain(recommendation, 'CRESCIMENTO_VENDAS');
  assert.equal(recommendation.acao_recomendada, 'MANTER_ESTRATEGIA');
});

test('margem baixa recomenda revisao sem aumentar preco automaticamente', () => {
  const recommendation = recommend(makeMetric({ margem_percentual: 8 }));

  assertMain(recommendation, 'MARGEM_BAIXA');
  assert.equal(recommendation.acao_recomendada, 'REVISAR_PRECO');
});

test('capital no percentil superior combinado com baixa saida gera capital parado', () => {
  const recommendation = recommend(makeMetric({
    capital_estoque: 900,
    quantidade_vendida: 5,
    tendencia_vendas: 'queda',
    variacao_vendas_percentual: -10,
    cobertura_dias: 40,
  }));

  assertMain(recommendation, 'CAPITAL_PARADO');
  assert.equal(recommendation.justificativas.some((item) => item.codigo === 'CAPITAL_RELEVANTE'), true);
});

test('conflito entre ruptura e crescimento mantem ruptura como principal', () => {
  const recommendation = recommend(makeMetric({
    cobertura_dias: 4,
    tendencia_vendas: 'crescimento',
    variacao_vendas_percentual: 40,
  }));

  assertMain(recommendation, 'RISCO_RUPTURA');
});

test('conflito entre venda zero e cobertura null nao gera reposicao', () => {
  const recommendation = recommend(makeMetric({
    quantidade_vendida: 0,
    venda_media_dia: 0,
    cobertura_dias: null,
    estoque_atual: 10,
  }));

  assertMain(recommendation, 'SEM_VENDAS');
  assert.notEqual(recommendation.acao_recomendada, 'REPOR_ESTOQUE');
});

test('produto vencido prevalece sobre venda zero e excesso', () => {
  const recommendation = recommend(makeMetric({
    dias_ate_vencimento: -10,
    quantidade_vendida: 0,
    cobertura_dias: 120,
  }));

  assertMain(recommendation, 'PRODUTO_VENCIDO');
});

test('score fica dentro do minimo e maximo', () => {
  const monitorar = recommend(makeMetric({ estoque_atual: 0, capital_estoque: 0 }));
  const vencido = recommend(makeMetric({ dias_ate_vencimento: -1, cobertura_dias: 120 }));

  assert.equal(monitorar.prioridade_score >= 0, true);
  assert.equal(vencido.prioridade_score <= 100, true);
});

test('classificacao de severidade segue faixas configuradas', () => {
  assert.equal(getRecommendationSeverity(100), 'critica');
  assert.equal(getRecommendationSeverity(60), 'alta');
  assert.equal(getRecommendationSeverity(35), 'media');
  assert.equal(getRecommendationSeverity(15), 'baixa');
  assert.equal(getRecommendationSeverity(14), 'informativa');
});

test('recomendacao nao contem NaN ou Infinity', () => {
  const recommendation = recommend(makeMetric({
    quantidade_vendida: 0,
    venda_media_dia: null,
    cobertura_dias: null,
    capital_estoque: null,
  }));

  assert.equal(hasInvalidNumber(recommendation), false);
});

test('textos incluem valores reais de estoque e capital', () => {
  const recommendation = recommend(makeMetric({
    quantidade_vendida: 0,
    estoque_atual: 24,
    capital_estoque: 144,
    cobertura_dias: null,
  }));

  assert.equal(recommendation.impacto.includes('R$'), true);
  assert.equal(recommendation.impacto.includes('24'), true);
});

test('recomendacao principal e unica por produto', () => {
  const recommendations = generateProductRecommendations([
    makeMetric({ produto_id: 'a', nome: 'A', cobertura_dias: 5 }),
    makeMetric({ produto_id: 'b', nome: 'B', quantidade_vendida: 0, cobertura_dias: null }),
  ]);

  assert.equal(recommendations.length, 2);
  assert.equal(recommendations.every((item) => typeof item.recomendacao_principal === 'string'), true);
});

test('validade em 14 dias e cobertura de 2,5 dias nao gera risco de vencimento', () => {
  const recommendation = recommend(makeMetric({
    dias_ate_vencimento: 14,
    cobertura_dias: 2.5,
    venda_media_dia: 4,
    estoque_atual: 10,
  }));

  assert.notEqual(recommendation.recomendacao_principal, 'RISCO_VENCIMENTO');
  assert.notEqual(recommendation.acao_recomendada, 'CRIAR_PROMOCAO');
});

test('validade em 28 dias e cobertura de 3,75 dias nao gera risco de vencimento', () => {
  const recommendation = recommend(makeMetric({
    dias_ate_vencimento: 28,
    cobertura_dias: 3.75,
    venda_media_dia: 4,
    estoque_atual: 15,
  }));

  assert.notEqual(recommendation.recomendacao_principal, 'RISCO_VENCIMENTO');
  assert.notEqual(recommendation.acao_recomendada, 'CRIAR_PROMOCAO');
});

test('validade em 10 dias e cobertura de 180 dias gera risco de vencimento', () => {
  const recommendation = recommend(makeMetric({
    dias_ate_vencimento: 10,
    cobertura_dias: 180,
    venda_media_dia: 0.1,
    estoque_atual: 18,
  }));

  assertMain(recommendation, 'RISCO_VENCIMENTO');
  assert.equal(recommendation.acao_recomendada, 'CRIAR_PROMOCAO');
});

test('cobertura null por venda zero e validade proxima gera risco de vencimento', () => {
  const recommendation = recommend(makeMetric({
    quantidade_vendida: 0,
    venda_media_dia: 0,
    cobertura_dias: null,
    dias_ate_vencimento: 10,
    estoque_atual: 12,
  }));

  assertMain(recommendation, 'RISCO_VENCIMENTO');
});

test('capital_em_risco e arredondado em duas casas', () => {
  const recommendations = generateProductRecommendations([
    makeMetric({
      produto_id: 'a',
      nome: 'A',
      quantidade_vendida: 0,
      cobertura_dias: null,
      capital_estoque: 100.335,
    }),
    makeMetric({
      produto_id: 'b',
      nome: 'B',
      cobertura_dias: 100,
      capital_estoque: 200.335,
    }),
  ]);
  const summary = summarizeProductRecommendations(recommendations);

  assert.equal(summary.capital_em_risco, 300.67);
});

test('risco de vencimento preserva justificativas secundarias', () => {
  const recommendation = recommend(makeMetric({
    dias_ate_vencimento: 10,
    cobertura_dias: 180,
    tendencia_vendas: 'queda',
    variacao_vendas_percentual: -30,
    capital_estoque: 900,
    dias_sem_venda: 40,
  }));

  assertMain(recommendation, 'RISCO_VENCIMENTO');
  assert.equal(recommendation.justificativas.some((item) => item.codigo === 'EXCESSO_COBERTURA' || item.codigo === 'COBERTURA_MUITO_EXCESSIVA'), true);
  assert.equal(recommendation.justificativas.some((item) => item.codigo === 'VARIACAO_QUEDA_RELEVANTE' || item.codigo === 'TENDENCIA_QUEDA'), true);
  assert.equal(recommendation.justificativas.some((item) => item.codigo === 'CAPITAL_RELEVANTE'), true);
  assert.equal(recommendation.justificativas.some((item) => item.codigo === 'BAIXA_VELOCIDADE_VENDA'), true);
});
