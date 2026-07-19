import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterRecommendationsByText,
  formatCoverageDays,
  formatCurrencyPtBr,
  formatPercentPtBr,
  getRecommendedActionLabel,
  getRecommendationTypeLabel,
  getSeverityLabel,
  getTrendLabel,
} from '../src/lib/analytics/recommendationLabels';

test('traduz recomendacao para texto de interface', () => {
  assert.equal(getRecommendationTypeLabel('RISCO_VENCIMENTO'), 'Risco de vencimento');
  assert.equal(getRecommendationTypeLabel('REPOSICAO_PRIORITARIA'), 'Reposição prioritária');
});

test('traduz acao recomendada para texto de interface', () => {
  assert.equal(getRecommendedActionLabel('SUSPENDER_REPOSICAO'), 'Suspender reposição');
  assert.equal(getRecommendedActionLabel('REPOR_ESTOQUE'), 'Repor estoque');
});

test('traduz severidade para texto de interface', () => {
  assert.equal(getSeverityLabel('critica'), 'Crítica');
  assert.equal(getSeverityLabel('informativa'), 'Informativa');
});

test('traduz tendencia para texto de interface', () => {
  assert.equal(getTrendLabel('dados_insuficientes'), 'Dados insuficientes');
  assert.equal(getTrendLabel('crescimento'), 'Crescimento');
  assert.equal(getTrendLabel('queda'), 'Queda');
  assert.equal(getTrendLabel('estavel'), 'Estável');
});

test('formata moeda em pt-BR', () => {
  assert.equal(formatCurrencyPtBr(844.5), 'R$\u00a0844,50');
});

test('formata cobertura nula como nao estimavel', () => {
  assert.equal(formatCoverageDays(null), 'Não estimável');
});

test('formata percentual com duas casas', () => {
  assert.equal(formatPercentPtBr(12.5), '12,50%');
});

test('filtra recomendacoes por texto ignorando acentos e categoria', () => {
  const items = [
    { nome: 'Feijão 1kg', categoria: 'Mercearia' },
    { nome: 'Leite Integral', categoria: 'Laticínios' },
    { nome: 'Café 250g', categoria: 'Mercearia' },
  ];

  assert.deepEqual(filterRecommendationsByText(items, 'feijao'), [items[0]]);
  assert.deepEqual(filterRecommendationsByText(items, 'laticinios'), [items[1]]);
  assert.equal(filterRecommendationsByText(items, '').length, 3);
});
