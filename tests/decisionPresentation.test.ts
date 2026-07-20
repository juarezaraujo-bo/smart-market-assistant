import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ProductRecommendation } from '../src/lib/analytics/productRecommendations';
import type { PromotionSimulation } from '../src/lib/analytics/promotionSimulator';
import {
  analysisViewOptions,
  buildActionPlanImpact,
  buildReferenceOptions,
  getTrendDisplay,
} from '../src/lib/analytics/decisionPresentation';

function simulation(overrides: Partial<PromotionSimulation> = {}): PromotionSimulation {
  return {
    tipo: 'simulacao_promocao',
    aviso: 'Simulação baseada em parâmetros estimados.',
    disponivel: true,
    motivo_indisponibilidade: null,
    preco_venda_atual: 9.99,
    preco_custo: 6,
    estoque_atual: 24,
    venda_media_dia: 0.1,
    dias_de_simulacao: 30,
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

function recommendation(sim = simulation(), overrides: Partial<ProductRecommendation> = {}): ProductRecommendation {
  return {
    produto_id: 'produto-1',
    nome: 'Produto Teste',
    categoria: 'Mercearia',
    prioridade_score: 100,
    severidade: 'critica',
    recomendacao_principal: 'RISCO_VENCIMENTO',
    diagnostico: 'Produto com risco de vencimento.',
    impacto: 'Impacto',
    acao_recomendada: 'CRIAR_PROMOCAO',
    justificativas: [],
    metricas_relevantes: {
      cobertura_dias: 10,
      tendencia_vendas_detalhada: 'SEM_VENDAS_RECENTES',
      periodos_disponiveis: 6,
    },
    simulacao_promocao: sim,
    ...overrides,
  };
}

test('unidades evitadas sao calculadas pela diferenca entre cenarios', () => {
  const text = buildActionPlanImpact(recommendation());

  assert.match(text, /Pode evitar que 10 unidades/);
  assert.match(text, /R\$\u00a060,00 em custo/);
});

test('cenario com estoque final positivo usa reduzir de X para Y', () => {
  const item = recommendation(simulation({
    estoque_estimado_sem_promocao: 15,
    capital_em_risco_estimado_sem_promocao: 31.5,
    melhor_cenario: {
      ...simulation().melhor_cenario!,
      estoque_estimado_com_promocao: 12,
      capital_em_risco_estimado_com_promocao: 25.2,
      reducao_capital_risco_percentual: 20,
    },
  }), { nome: 'Iogurte Natural 170g' });

  const text = buildActionPlanImpact(item);

  assert.match(text, /reduzir o estoque parado de 15 para 12 unidades/);
  assert.match(text, /evitando aproximadamente 3 unidades/);
  assert.match(text, /R\$\u00a06,30 em custo/);
  assert.equal(text.includes('Pode evitar que 15 unidades'), false);
});

test('filtros de visao exibem periodos corretos e historico nao tem periodo redundante', () => {
  const periods = [
    { periodo_inicio: '2026-04-01', periodo_fim: '2026-04-30' },
    { periodo_inicio: '2026-05-01', periodo_fim: '2026-05-31' },
    { periodo_inicio: '2026-06-01', periodo_fim: '2026-06-30' },
  ];

  assert.equal(buildReferenceOptions('mensal', periods)[0].label, 'Junho de 2026');
  assert.equal(buildReferenceOptions('trimestral', periods)[0].label, '2º trimestre de 2026');
  assert.equal(buildReferenceOptions('semestral', periods)[0].label, '1º semestre de 2026');
  assert.equal(buildReferenceOptions('anual', periods)[0].label, '2026');
  assert.equal(analysisViewOptions.find((option) => option.value === 'anual')?.label, 'Acumulado anual');
  assert.equal(buildReferenceOptions('historico', periods).length, 0);
});

test('estado sem vendas pode receber detalhe objetivo', () => {
  assert.equal(getTrendDisplay(recommendation()), 'Sem vendas nos últimos 2 meses');
});

test('resumo superior usa Capital estimado parado na interface', () => {
  const page = readFileSync('src/app/(dashboard)/decisoes/page.tsx', 'utf8');

  assert.equal(page.includes('Capital estimado parado'), true);
});
