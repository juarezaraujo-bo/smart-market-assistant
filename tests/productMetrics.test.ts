import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePeriodoDays,
  calculateProductMetrics,
  calculateSalesTrend,
  parseAnalyticsLimit,
  type ProductHistoryRecord,
} from '../src/lib/analytics/productMetrics';

function makeRecord(overrides: Partial<ProductHistoryRecord> = {}): ProductHistoryRecord {
  return {
    produto_id: 'produto-1',
    nome: 'Produto Teste',
    categoria: 'Categoria',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-06-30',
    quantidade_vendida: 60,
    estoque_atual: 30,
    preco_custo: 4,
    preco_venda: 10,
    ultima_venda: '2026-06-20',
    data_validade: '2026-07-05',
    ...overrides,
  };
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasInvalidNumber);
  return false;
}

test('calcula periodo de 30 dias de forma inclusiva', () => {
  assert.equal(calculatePeriodoDays('2026-06-01', '2026-06-30'), 30);
});

test('calcula periodo de 28 dias de forma inclusiva', () => {
  assert.equal(calculatePeriodoDays('2026-02-01', '2026-02-28'), 28);
});

test('retorna cobertura nula quando vendas sao iguais a zero', () => {
  const metrics = calculateProductMetrics([makeRecord({ quantidade_vendida: 0 })]);

  assert.equal(metrics.venda_media_dia, 0);
  assert.equal(metrics.cobertura_dias, null);
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'SEM_VENDAS_PARA_COBERTURA'), true);
});

test('retorna margem percentual nula quando preco de venda e zero', () => {
  const metrics = calculateProductMetrics([makeRecord({ preco_venda: 0 })]);

  assert.equal(metrics.margem_percentual, null);
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'PRECO_VENDA_ZERO'), true);
});

test('retorna dias_sem_venda nulo quando ultima venda esta ausente', () => {
  const metrics = calculateProductMetrics([makeRecord({ ultima_venda: null })]);

  assert.equal(metrics.dias_sem_venda, null);
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'ULTIMA_VENDA_AUSENTE'), true);
});

test('retorna dias_ate_vencimento nulo quando validade esta ausente', () => {
  const metrics = calculateProductMetrics([makeRecord({ data_validade: null })]);

  assert.equal(metrics.dias_ate_vencimento, null);
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'VALIDADE_AUSENTE'), true);
});

test('retorna dias_ate_vencimento negativo para produto vencido no fechamento do periodo', () => {
  const metrics = calculateProductMetrics([makeRecord({ data_validade: '2026-06-25' })]);

  assert.equal(metrics.dias_ate_vencimento, -5);
});

test('classifica tendencia de crescimento', () => {
  const trend = calculateSalesTrend([
    makeRecord({ periodo_inicio: '2026-04-01', periodo_fim: '2026-04-30', quantidade_vendida: 10 }),
    makeRecord({ periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31', quantidade_vendida: 14 }),
    makeRecord({ periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30', quantidade_vendida: 20 }),
  ]);

  assert.equal(trend, 'crescimento');
});

test('classifica tendencia de queda', () => {
  const trend = calculateSalesTrend([
    makeRecord({ periodo_inicio: '2026-04-01', periodo_fim: '2026-04-30', quantidade_vendida: 30 }),
    makeRecord({ periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31', quantidade_vendida: 24 }),
    makeRecord({ periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30', quantidade_vendida: 16 }),
  ]);

  assert.equal(trend, 'queda');
});

test('classifica tendencia estavel com pequenas oscilacoes dentro da tolerancia', () => {
  const trend = calculateSalesTrend([
    makeRecord({ periodo_inicio: '2026-04-01', periodo_fim: '2026-04-30', quantidade_vendida: 100 }),
    makeRecord({ periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31', quantidade_vendida: 106 }),
    makeRecord({ periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30', quantidade_vendida: 103 }),
  ], { tolerancePercent: 10 });

  assert.equal(trend, 'estavel');
});

test('classifica tendencia como dados insuficientes com menos de tres periodos', () => {
  const metrics = calculateProductMetrics([
    makeRecord({ periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31', quantidade_vendida: 10 }),
    makeRecord({ periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30', quantidade_vendida: 12 }),
  ]);

  assert.equal(metrics.tendencia_vendas, 'dados_insuficientes');
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'DADOS_INSUFICIENTES_TENDENCIA'), true);
});

test('retorna variacao percentual nula quando periodo anterior teve venda zero', () => {
  const metrics = calculateProductMetrics([
    makeRecord({ periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31', quantidade_vendida: 0 }),
    makeRecord({ periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30', quantidade_vendida: 12 }),
  ]);

  assert.equal(metrics.variacao_vendas_percentual, null);
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'PERIODO_ANTERIOR_SEM_VENDAS'), true);
});

test('registra observacao estruturada para cobertura nao calculavel', () => {
  const metrics = calculateProductMetrics([makeRecord({ quantidade_vendida: 0 })]);
  const observation = metrics.observacoes.find((item) => item.codigo === 'SEM_VENDAS_PARA_COBERTURA');

  assert.equal(metrics.cobertura_dias, null);
  assert.equal(observation?.campo, 'cobertura_dias');
});

test('registra observacao estruturada para variacao com periodo anterior zero', () => {
  const metrics = calculateProductMetrics([
    makeRecord({ periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31', quantidade_vendida: 0 }),
    makeRecord({ periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30', quantidade_vendida: 12 }),
  ]);
  const observation = metrics.observacoes.find((item) => item.codigo === 'PERIODO_ANTERIOR_SEM_VENDAS');

  assert.equal(metrics.variacao_vendas_percentual, null);
  assert.equal(observation?.campo, 'variacao_vendas_percentual');
});

test('ultima venda posterior ao fim do periodo retorna null e observacao', () => {
  const metrics = calculateProductMetrics([makeRecord({ ultima_venda: '2026-07-01' })]);

  assert.equal(metrics.dias_sem_venda, null);
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'DATA_ULTIMA_VENDA_INVALIDA'), true);
});

test('periodo invalido nao gera NaN e registra observacao', () => {
  const metrics = calculateProductMetrics([
    makeRecord({ periodo_inicio: '2026-06-30', periodo_fim: '2026-06-01' }),
  ]);

  assert.equal(metrics.dias_periodo, null);
  assert.equal(metrics.venda_media_dia, null);
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'PERIODO_INVALIDO'), true);
  assert.equal(hasInvalidNumber(metrics), false);
});

test('ausencia simultanea de ultima venda e validade registra os dois motivos', () => {
  const metrics = calculateProductMetrics([makeRecord({ ultima_venda: null, data_validade: null })]);

  assert.equal(metrics.observacoes.some((item) => item.codigo === 'ULTIMA_VENDA_AUSENTE'), true);
  assert.equal(metrics.observacoes.some((item) => item.codigo === 'VALIDADE_AUSENTE'), true);
});

test('nao retorna Infinity ou NaN em metricas com zeros', () => {
  const metrics = calculateProductMetrics([
    makeRecord({
      quantidade_vendida: 0,
      estoque_atual: 0,
      preco_custo: 0,
      preco_venda: 0,
    }),
  ]);

  assert.equal(hasInvalidNumber(metrics), false);
});

test('tendencia com empate dentro da tolerancia permanece estavel', () => {
  const trend = calculateSalesTrend([
    makeRecord({ periodo_inicio: '2026-04-01', periodo_fim: '2026-04-30', quantidade_vendida: 100 }),
    makeRecord({ periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31', quantidade_vendida: 110 }),
    makeRecord({ periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30', quantidade_vendida: 110 }),
  ], { tolerancePercent: 10 });

  assert.equal(trend, 'estavel');
});

test('arredonda indicadores de exibicao de forma consistente', () => {
  const metrics = calculateProductMetrics([
    makeRecord({
      quantidade_vendida: 7,
      estoque_atual: 3,
      preco_custo: 1.111,
      preco_venda: 2.999,
    }),
  ]);

  assert.equal(metrics.venda_media_dia, 0.23);
  assert.equal(metrics.cobertura_dias, 12.86);
  assert.equal(metrics.capital_estoque, 3.33);
  assert.equal(metrics.margem_unitaria, 1.89);
  assert.equal(metrics.margem_percentual, 62.95);
});

test('valida limite da rota analitica como inteiro entre 1 e 500', () => {
  assert.equal(parseAnalyticsLimit(null), 100);
  assert.equal(parseAnalyticsLimit('1'), 1);
  assert.equal(parseAnalyticsLimit('500'), 500);
  assert.equal(parseAnalyticsLimit('0'), null);
  assert.equal(parseAnalyticsLimit('501'), null);
  assert.equal(parseAnalyticsLimit('10.5'), null);
  assert.equal(parseAnalyticsLimit('abc'), null);
});
