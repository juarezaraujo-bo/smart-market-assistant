import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  calculateProductMetrics,
  parseAnalyticsLimit,
  type ProductHistoryRecord,
  type ProductMetrics,
} from '@/lib/analytics/productMetrics';

type ClienteRecord = {
  id: string;
};

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

type ErrorWithMessage = {
  message?: string;
};

export const dynamic = 'force-dynamic';

function createAuthenticatedClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase nao configurado.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

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

async function findClienteForUser(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('clientes')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ClienteRecord | null;
}

async function loadProductPeriods(supabase: SupabaseClient, clienteId: string, produtoId: string | null) {
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

  return (data || []) as unknown as ProdutoPeriodoRow[];
}

function buildMetricsResponse(
  records: ProductHistoryRecord[],
  periodoInicio: string | null,
  periodoFim: string | null,
  categoria: string | null,
  limite: number
) {
  const grouped = groupByProduct(records);
  const metrics: ProductMetrics[] = [];

  for (const productRecords of grouped.values()) {
    const sorted = sortProductHistory(productRecords);
    const targetRecords = sorted.filter((record) => matchesTargetPeriod(record, periodoInicio, periodoFim));
    const target = targetRecords[targetRecords.length - 1];

    if (!target) continue;
    if (categoria && target.categoria !== categoria) continue;

    const historyUntilTarget = sorted.filter((record) => {
      if (record.periodo_fim < target.periodo_fim) return true;
      if (record.periodo_fim === target.periodo_fim) return record.periodo_inicio <= target.periodo_inicio;
      return false;
    });

    metrics.push(calculateProductMetrics(historyUntilTarget));
  }

  return metrics
    .sort((a, b) => {
      const capitalCompare = (b.capital_estoque ?? 0) - (a.capital_estoque ?? 0);
      if (capitalCompare !== 0) return capitalCompare;
      return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR');
    })
    .slice(0, limite);
}

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization');
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const periodoInicio = searchParams.get('periodo_inicio');
    const periodoFim = searchParams.get('periodo_fim');
    const produtoId = searchParams.get('produto_id');
    const categoria = searchParams.get('categoria');
    const limite = parseAnalyticsLimit(searchParams.get('limite'));

    if (periodoInicio && !isValidDate(periodoInicio)) {
      return NextResponse.json({ error: 'periodo_inicio deve estar no formato YYYY-MM-DD.' }, { status: 400 });
    }

    if (periodoFim && !isValidDate(periodoFim)) {
      return NextResponse.json({ error: 'periodo_fim deve estar no formato YYYY-MM-DD.' }, { status: 400 });
    }

    if (periodoInicio && periodoFim && periodoFim < periodoInicio) {
      return NextResponse.json({ error: 'periodo_fim nao pode ser menor que periodo_inicio.' }, { status: 400 });
    }

    if (limite === null) {
      return NextResponse.json({ error: 'limite deve ser um numero inteiro entre 1 e 500.' }, { status: 400 });
    }

    const supabase = createAuthenticatedClient(accessToken);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    }

    const cliente = await findClienteForUser(supabase, user.id);
    if (!cliente) {
      return NextResponse.json({ error: 'Mercado nao encontrado para o usuario autenticado.' }, { status: 403 });
    }

    const rows = await loadProductPeriods(supabase, cliente.id, produtoId);
    const records = rows.map(toHistoryRecord);
    const produtos = buildMetricsResponse(records, periodoInicio, periodoFim, categoria, limite);

    return NextResponse.json({
      total: produtos.length,
      filtros: {
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        produto_id: produtoId,
        categoria,
        limite,
      },
      produtos,
    });
  } catch (error: unknown) {
    const message = (error as ErrorWithMessage).message || 'Erro ao calcular indicadores de produtos.';
    console.error('[Analytics Products Error]', message);
    return NextResponse.json({ error: 'Erro ao calcular indicadores de produtos.' }, { status: 500 });
  }
}
