import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadProductPeriodRecords,
  getProductMetricsForClient,
} from '@/lib/analytics/productAnalyticsService';
import type { ProductMetrics } from '@/lib/analytics/productMetrics';
import {
  generateProductRecommendations,
  summarizeProductRecommendations,
  type ProductRecommendation,
} from '@/lib/analytics/productRecommendations';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import {
  assistantToolArgumentSchemas,
  consultarProdutoSchema,
  consultarRecomendacoesSchema,
  consultarResumoDecisoesSchema,
  compararProdutoPeriodosSchema,
} from './assistantToolSchemas';
import type {
  AssistantPeriod,
  AssistantToolContext,
  AssistantToolName,
  ProductLookupResult,
} from './assistantTypes';

type ZodInfer<T> = T extends { parse: (input: unknown) => infer R } ? R : never;
type ConsultarResumoArgs = ZodInfer<typeof consultarResumoDecisoesSchema>;
type ConsultarRecomendacoesArgs = ZodInfer<typeof consultarRecomendacoesSchema>;
type ConsultarProdutoArgs = ZodInfer<typeof consultarProdutoSchema>;
type CompararProdutoArgs = ZodInfer<typeof compararProdutoPeriodosSchema>;

type PeriodRow = {
  periodo_inicio: string;
  periodo_fim: string;
};

function withoutNullValues(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== null)
  );
}

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function uniquePeriods(rows: PeriodRow[]) {
  const map = new Map<string, AssistantPeriod>();
  for (const row of rows) {
    const key = `${row.periodo_inicio}|${row.periodo_fim}`;
    map.set(key, {
      periodo_inicio: row.periodo_inicio,
      periodo_fim: row.periodo_fim,
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const endCompare = b.periodo_fim.localeCompare(a.periodo_fim);
    if (endCompare !== 0) return endCompare;
    return b.periodo_inicio.localeCompare(a.periodo_inicio);
  });
}

function getLatestPeriodFromMetrics(metrics: ProductMetrics[]): AssistantPeriod | null {
  const periods = uniquePeriods(metrics.map((metric) => ({
    periodo_inicio: metric.periodo_inicio,
    periodo_fim: metric.periodo_fim,
  })));
  return periods[0] || null;
}

function periodFilters(period?: Partial<AssistantPeriod>) {
  return {
    periodoInicio: period?.periodo_inicio || null,
    periodoFim: period?.periodo_fim || null,
    produtoId: null,
    categoria: null,
    limite: 500,
  };
}

function sanitizeMetricRecord(metric: ProductMetrics) {
  return {
    produto_id: metric.produto_id,
    nome: metric.nome,
    categoria: metric.categoria,
    periodo_inicio: metric.periodo_inicio,
    periodo_fim: metric.periodo_fim,
    quantidade_vendida: metric.quantidade_vendida,
    estoque_atual: metric.estoque_atual,
    venda_media_dia: metric.venda_media_dia,
    cobertura_dias: metric.cobertura_dias,
    capital_estoque: metric.capital_estoque,
    margem_percentual: metric.margem_percentual,
    dias_sem_venda: metric.dias_sem_venda,
    dias_ate_vencimento: metric.dias_ate_vencimento,
    variacao_vendas_percentual: metric.variacao_vendas_percentual,
    tendencia_vendas: metric.tendencia_vendas,
  };
}

function sanitizeRecommendation(recommendation: ProductRecommendation) {
  return {
    produto_id: recommendation.produto_id,
    nome: recommendation.nome,
    categoria: recommendation.categoria,
    prioridade_score: recommendation.prioridade_score,
    severidade: recommendation.severidade,
    recomendacao_principal: recommendation.recomendacao_principal,
    diagnostico: recommendation.diagnostico,
    impacto: recommendation.impacto,
    acao_recomendada: recommendation.acao_recomendada,
    justificativas: recommendation.justificativas,
    metricas_relevantes: recommendation.metricas_relevantes,
  };
}

async function loadMetrics(context: AssistantToolContext, args: {
  periodo_inicio?: string;
  periodo_fim?: string;
  produto_id?: string | null;
  categoria?: string | null;
  limite?: number;
}) {
  return getProductMetricsForClient(context.supabase, context.clienteId, {
    periodoInicio: args.periodo_inicio || null,
    periodoFim: args.periodo_fim || null,
    produtoId: args.produto_id || null,
    categoria: args.categoria || null,
    limite: args.limite || 500,
  });
}

export async function listarPeriodos(context: AssistantToolContext) {
  const records = await loadProductPeriodRecords(context.supabase, context.clienteId, null);
  const periodos = uniquePeriods(records.map((record) => ({
    periodo_inicio: record.periodo_inicio,
    periodo_fim: record.periodo_fim,
  })));

  return {
    periodos,
    periodo_mais_recente: periodos[0] || null,
  };
}

export async function consultarResumoDecisoes(context: AssistantToolContext, input: unknown) {
  const args = assistantToolArgumentSchemas.consultar_resumo_decisoes.parse(withoutNullValues(input)) as ConsultarResumoArgs;
  const metrics = await loadMetrics(context, args);
  const recommendations = generateProductRecommendations(metrics);
  const periodo = getLatestPeriodFromMetrics(metrics);

  return {
    periodo,
    produtos_analisados: metrics.length,
    resumo: summarizeProductRecommendations(recommendations),
    maiores_prioridades: recommendations.slice(0, 10).map(sanitizeRecommendation),
  };
}

export async function consultarRecomendacoes(context: AssistantToolContext, input: unknown) {
  const args = assistantToolArgumentSchemas.consultar_recomendacoes.parse(withoutNullValues(input)) as ConsultarRecomendacoesArgs;
  const metrics = await loadMetrics(context, {
    periodo_inicio: args.periodo_inicio,
    periodo_fim: args.periodo_fim,
    categoria: args.categoria,
    limite: 500,
  });
  const limit = args.limite ?? 10;
  const recommendations = generateProductRecommendations(metrics)
    .filter((item) => !args.severidade || item.severidade === args.severidade)
    .filter((item) => !args.recomendacao || item.recomendacao_principal === args.recomendacao)
    .slice(0, Math.min(limit, 20));

  return {
    periodo: getLatestPeriodFromMetrics(metrics),
    total_retornado: recommendations.length,
    recomendacoes: recommendations.map(sanitizeRecommendation),
  };
}

function findMatchingRecommendations(recommendations: ProductRecommendation[], productName: string) {
  const normalizedProduct = normalizeText(productName);
  return recommendations.filter((recommendation) =>
    normalizeText(recommendation.nome).includes(normalizedProduct)
  );
}

export async function consultarProduto(context: AssistantToolContext, input: unknown): Promise<ProductLookupResult> {
  const args = assistantToolArgumentSchemas.consultar_produto.parse(withoutNullValues(input)) as ConsultarProdutoArgs;
  const metrics = await loadMetrics(context, {
    periodo_inicio: args.periodo_inicio,
    periodo_fim: args.periodo_fim,
    limite: 500,
  });
  const recommendations = generateProductRecommendations(metrics);
  const matches = findMatchingRecommendations(recommendations, args.produto);

  if (matches.length === 0) {
    return {
      status: 'not_found',
      message: 'Nenhum produto encontrado com esse nome no periodo consultado.',
    };
  }

  if (matches.length > 1) {
    return {
      status: 'multiple_matches',
      matches: matches.slice(0, 10).map((item) => ({
        produto_id: item.produto_id,
        nome: item.nome,
        categoria: item.categoria,
      })),
      message: 'Encontrei mais de um produto parecido. Peca ao usuario para especificar qual produto deseja.',
    };
  }

  return {
    status: 'found',
    produto: sanitizeRecommendation(matches[0]) as ProductRecommendation,
    periodo: getLatestPeriodFromMetrics(metrics),
  };
}

function previousPeriod(periods: AssistantPeriod[], current: AssistantPeriod | null) {
  if (!current) return null;
  const index = periods.findIndex((period) =>
    period.periodo_inicio === current.periodo_inicio && period.periodo_fim === current.periodo_fim
  );
  return index >= 0 ? periods[index + 1] || null : null;
}

export async function compararProdutoPeriodos(context: AssistantToolContext, input: unknown) {
  const args = assistantToolArgumentSchemas.comparar_produto_periodos.parse(withoutNullValues(input)) as CompararProdutoArgs;
  const periodInfo = await listarPeriodos(context);
  const currentPeriod = args.periodo_atual_inicio && args.periodo_atual_fim
    ? { periodo_inicio: args.periodo_atual_inicio, periodo_fim: args.periodo_atual_fim }
    : periodInfo.periodo_mais_recente;
  const previous = args.periodo_anterior_inicio && args.periodo_anterior_fim
    ? { periodo_inicio: args.periodo_anterior_inicio, periodo_fim: args.periodo_anterior_fim }
    : previousPeriod(periodInfo.periodos, currentPeriod);

  if (!currentPeriod || !previous) {
    return {
      status: 'insufficient_periods',
      message: 'Nao ha periodos suficientes para comparar.',
    };
  }

  const current = await consultarProduto(context, {
    produto: args.produto,
    periodo_inicio: currentPeriod.periodo_inicio,
    periodo_fim: currentPeriod.periodo_fim,
  });
  const previousResult = await consultarProduto(context, {
    produto: args.produto,
    periodo_inicio: previous.periodo_inicio,
    periodo_fim: previous.periodo_fim,
  });

  return {
    status: 'ok',
    periodo_atual: currentPeriod,
    periodo_anterior: previous,
    atual: current,
    anterior: previousResult,
  };
}

export async function executeAssistantTool(
  toolName: AssistantToolName,
  input: unknown,
  context: AssistantToolContext
) {
  if (toolName === 'listar_periodos') return listarPeriodos(context);
  if (toolName === 'consultar_resumo_decisoes') return consultarResumoDecisoes(context, input);
  if (toolName === 'consultar_recomendacoes') return consultarRecomendacoes(context, input);
  if (toolName === 'consultar_produto') return consultarProduto(context, input);
  if (toolName === 'comparar_produto_periodos') return compararProdutoPeriodos(context, input);
  throw new Error('Ferramenta nao permitida.');
}

export function createDefaultAssistantToolContext(clienteId: string, supabase?: SupabaseClient): AssistantToolContext {
  return {
    clienteId,
    supabase: supabase || getSupabaseAdminClient(),
  };
}

export { periodFilters, sanitizeMetricRecord };
