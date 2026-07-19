import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculateProductMetrics,
  type ProductHistoryRecord,
  type ProductMetrics,
} from '@/lib/analytics/productMetrics';

type ProdutoJoin = {
  nome: string | null;
  categoria: string | null;
};

type ProdutoPeriodoRow = {
  id: string;
  produto_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  quantidade_vendida: number | string;
  estoque_atual: number | string;
  preco_custo: number | string | null;
  preco_venda: number | string | null;
  ultima_venda: string | null;
  data_validade: string | null;
  produtos?: ProdutoJoin | ProdutoJoin[] | null;
};

export type ProductAnalyticsFilters = {
  periodoInicio: string | null;
  periodoFim: string | null;
  produtoId: string | null;
  categoria: string | null;
  limite: number;
};

function getProdutoJoin(row: ProdutoPeriodoRow) {
  if (Array.isArray(row.produtos)) return row.produtos[0] || null;
  return row.produtos || null;
}

function toNumber(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toHistoryRecord(row: ProdutoPeriodoRow): ProductHistoryRecord {
  const produto = getProdutoJoin(row);

  return {
    id: row.id,
    produto_id: row.produto_id,
    nome: produto?.nome ?? null,
    categoria: produto?.categoria ?? null,
    periodo_inicio: row.periodo_inicio,
    periodo_fim: row.periodo_fim,
    quantidade_vendida: toNumber(row.quantidade_vendida) ?? 0,
    estoque_atual: toNumber(row.estoque_atual) ?? 0,
    preco_custo: toNumber(row.preco_custo),
    preco_venda: toNumber(row.preco_venda),
    ultima_venda: row.ultima_venda,
    data_validade: row.data_validade,
  };
}

function groupByProduct(records: ProductHistoryRecord[]) {
  const grouped = new Map<string, ProductHistoryRecord[]>();

  for (const record of records) {
    const current = grouped.get(record.produto_id) || [];
    current.push(record);
    grouped.set(record.produto_id, current);
  }

  return grouped;
}

function sortProductHistory(records: ProductHistoryRecord[]) {
  return [...records].sort((a, b) => {
    const endCompare = a.periodo_fim.localeCompare(b.periodo_fim);
    if (endCompare !== 0) return endCompare;
    return a.periodo_inicio.localeCompare(b.periodo_inicio);
  });
}

function matchesTargetPeriod(record: ProductHistoryRecord, periodoInicio: string | null, periodoFim: string | null) {
  if (periodoInicio && record.periodo_inicio < periodoInicio) return false;
  if (periodoFim && record.periodo_fim > periodoFim) return false;
  return true;
}

export function sortProductMetrics(metrics: ProductMetrics[]) {
  return [...metrics].sort((a, b) => {
    const capitalCompare = (b.capital_estoque ?? 0) - (a.capital_estoque ?? 0);
    if (capitalCompare !== 0) return capitalCompare;
    return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR');
  });
}

export async function loadProductPeriodRecords(
  supabase: SupabaseClient,
  clienteId: string,
  produtoId: string | null
) {
  let query = supabase
    .from('produto_periodos')
    .select(`
      id,
      produto_id,
      periodo_inicio,
      periodo_fim,
      quantidade_vendida,
      estoque_atual,
      preco_custo,
      preco_venda,
      ultima_venda,
      data_validade,
      produtos:produto_id (
        nome,
        categoria
      )
    `)
    .eq('cliente_id', clienteId)
    .order('periodo_fim', { ascending: true })
    .order('periodo_inicio', { ascending: true });

  if (produtoId) {
    query = query.eq('produto_id', produtoId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data || []) as unknown as ProdutoPeriodoRow[]).map(toHistoryRecord);
}

export function buildProductMetricsResponse(records: ProductHistoryRecord[], filters: ProductAnalyticsFilters) {
  const grouped = groupByProduct(records);
  const metrics: ProductMetrics[] = [];

  for (const productRecords of grouped.values()) {
    const sorted = sortProductHistory(productRecords);
    const targetRecords = sorted.filter((record) =>
      matchesTargetPeriod(record, filters.periodoInicio, filters.periodoFim)
    );
    const target = targetRecords[targetRecords.length - 1];

    if (!target) continue;
    if (filters.categoria && target.categoria !== filters.categoria) continue;

    const historyUntilTarget = sorted.filter((record) => {
      if (record.periodo_fim < target.periodo_fim) return true;
      if (record.periodo_fim === target.periodo_fim) return record.periodo_inicio <= target.periodo_inicio;
      return false;
    });

    metrics.push(calculateProductMetrics(historyUntilTarget));
  }

  return sortProductMetrics(metrics).slice(0, filters.limite);
}

export async function getProductMetricsForClient(
  supabase: SupabaseClient,
  clienteId: string,
  filters: ProductAnalyticsFilters
) {
  const records = await loadProductPeriodRecords(supabase, clienteId, filters.produtoId);
  return buildProductMetricsResponse(records, filters);
}
