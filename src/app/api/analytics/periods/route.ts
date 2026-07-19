import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type ClienteRecord = {
  id: string;
};

type PeriodRow = {
  periodo_inicio: string;
  periodo_fim: string;
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

    const supabase = createAuthenticatedClient(accessToken);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: 'Sessao expirada ou usuario nao autenticado.' }, { status: 401 });
    }

    const cliente = await findClienteForUser(supabase, user.id);
    if (!cliente) {
      return NextResponse.json({ error: 'Mercado nao encontrado para o usuario autenticado.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('produto_periodos')
      .select('periodo_inicio, periodo_fim')
      .eq('cliente_id', cliente.id)
      .order('periodo_fim', { ascending: false })
      .order('periodo_inicio', { ascending: false });

    if (error) throw new Error(error.message);

    const uniquePeriods = new Map<string, PeriodRow>();
    for (const row of (data || []) as PeriodRow[]) {
      const key = `${row.periodo_inicio}:${row.periodo_fim}`;
      if (!uniquePeriods.has(key)) uniquePeriods.set(key, row);
    }

    return NextResponse.json({
      periodos: Array.from(uniquePeriods.values()),
    });
  } catch (error: unknown) {
    const message = (error as ErrorWithMessage).message || 'Erro ao carregar periodos.';
    console.error('[Analytics Periods Error]', message);
    return NextResponse.json({ error: 'Erro ao carregar periodos.' }, { status: 500 });
  }
}
