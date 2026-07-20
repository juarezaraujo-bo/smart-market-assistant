import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductMetricsResponse } from '../src/lib/analytics/productAnalyticsService';
import type { ProductHistoryRecord } from '../src/lib/analytics/productMetrics';

function record(periodo_inicio: string, periodo_fim: string, quantidade_vendida: number, estoque_atual: number): ProductHistoryRecord {
  return {
    produto_id: 'produto-1',
    nome: 'Produto Teste',
    categoria: 'Mercearia',
    periodo_inicio,
    periodo_fim,
    quantidade_vendida,
    estoque_atual,
    preco_custo: 5,
    preco_venda: 10,
    ultima_venda: periodo_fim,
    data_validade: '2026-12-31',
  };
}

const records = [
  record('2026-01-01', '2026-01-31', 1, 40),
  record('2026-02-01', '2026-02-28', 2, 38),
  record('2026-03-01', '2026-03-31', 3, 35),
  record('2026-04-01', '2026-04-30', 4, 31),
  record('2026-05-01', '2026-05-31', 5, 26),
  record('2026-06-01', '2026-06-30', 6, 20),
];

test('mensal utiliza um snapshot', () => {
  const [metric] = buildProductMetricsResponse(records, {
    periodoInicio: '2026-06-01',
    periodoFim: '2026-06-30',
    produtoId: null,
    categoria: null,
    limite: 100,
  });

  assert.equal(metric.quantidade_vendida, 6);
  assert.equal(metric.estoque_atual, 20);
  assert.equal(metric.periodos_disponiveis, 6);
});

test('trimestre agrega somente tres meses correspondentes', () => {
  const [metric] = buildProductMetricsResponse(records, {
    periodoInicio: '2026-04-01',
    periodoFim: '2026-06-30',
    produtoId: null,
    categoria: null,
    limite: 100,
  });

  assert.equal(metric.quantidade_vendida, 15);
  assert.equal(metric.estoque_atual, 20);
  assert.equal(metric.periodos_disponiveis, 3);
  assert.equal(metric.periodos_esperados, 3);
});

test('semestre e historico completo mantem serie e estoque mais recente', () => {
  const [metric] = buildProductMetricsResponse(records, {
    periodoInicio: '2026-01-01',
    periodoFim: '2026-06-30',
    produtoId: null,
    categoria: null,
    limite: 100,
  });
  const [fullMetric] = buildProductMetricsResponse(records, {
    periodoInicio: null,
    periodoFim: null,
    produtoId: null,
    categoria: null,
    limite: 100,
    historicoCompleto: true,
  });

  assert.equal(metric.quantidade_vendida, 21);
  assert.equal(metric.estoque_atual, 20);
  assert.equal(fullMetric.quantidade_vendida, 21);
  assert.equal(fullMetric.periodos_disponiveis, 6);
  assert.notEqual(fullMetric.tendencia_vendas_detalhada, 'SEM_HISTORICO_COMPARATIVO');
});

test('anual agrega somente o ano selecionado', () => {
  const mixed = [
    record('2025-12-01', '2025-12-31', 100, 90),
    ...records,
  ];
  const [metric] = buildProductMetricsResponse(mixed, {
    periodoInicio: '2026-01-01',
    periodoFim: '2026-12-31',
    produtoId: null,
    categoria: null,
    limite: 100,
  });

  assert.equal(metric.quantidade_vendida, 21);
  assert.equal(metric.estoque_atual, 20);
  assert.equal((metric.periodos_ausentes ?? []).includes('12/2025'), false);
});

test('mes ausente nao e tratado como venda zero', () => {
  const missing = [
    record('2026-04-01', '2026-04-30', 4, 31),
    record('2026-06-01', '2026-06-30', 6, 20),
  ];
  const [metric] = buildProductMetricsResponse(missing, {
    periodoInicio: '2026-04-01',
    periodoFim: '2026-06-30',
    produtoId: null,
    categoria: null,
    limite: 100,
  });

  assert.equal(metric.quantidade_vendida, 10);
  assert.deepEqual(metric.periodos_ausentes, ['05/2026']);
  assert.equal(metric.tendencia_vendas_detalhada, 'HISTORICO_INCOMPLETO');
});
