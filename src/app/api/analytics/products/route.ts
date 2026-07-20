import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  parseAnalyticsLimit,
} from '@/lib/analytics/productMetrics';
import { getProductMetricsForClient } from '@/lib/analytics/productAnalyticsService';

type ClienteRecord = {
  id: string;
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
    const historicoCompleto = searchParams.get('historico') === 'completo';
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

    const produtos = await getProductMetricsForClient(supabase, cliente.id, {
      periodoInicio: historicoCompleto ? null : periodoInicio,
      periodoFim: historicoCompleto ? null : periodoFim,
      produtoId,
      categoria,
      limite,
      historicoCompleto,
    });

    return NextResponse.json({
      total: produtos.length,
      filtros: {
        periodo_inicio: historicoCompleto ? null : periodoInicio,
        periodo_fim: historicoCompleto ? null : periodoFim,
        historico_completo: historicoCompleto,
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
