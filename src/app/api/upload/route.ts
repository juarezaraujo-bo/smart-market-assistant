import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ExcelService } from '@/lib/excelService';
import { runAnalysis } from '@/lib/analysisEngine';

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization');
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase nao configurado.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const clienteId = formData.get('clienteId') as string;

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    if (!clienteId) return NextResponse.json({ error: 'ID do cliente nao identificado.' }, { status: 400 });

    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('id')
      .eq('id', clienteId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (clienteError || !cliente) {
      return NextResponse.json({ error: 'Mercado nao encontrado para o usuario autenticado.' }, { status: 403 });
    }

    const report = await ExcelService.parseFile(file);

    if (report.status === 'failed') {
      return NextResponse.json({ error: 'Falha na validacao dos dados.', report }, { status: 400 });
    }

    for (const row of report.data) {
      const { data: product, error: productError } = await supabase
        .from('produtos')
        .upsert({
          cliente_id: clienteId,
          nome: row.produto,
          categoria: row.categoria,
          preco_custo: row.custo,
          preco_venda: row.preco_venda,
        }, { onConflict: 'cliente_id,nome' })
        .select()
        .single();

      if (productError || !product) {
        console.error(`Erro ao salvar produto ${row.produto}:`, productError);
        continue;
      }

      await supabase
        .from('estoque')
        .upsert({
          produto_id: product.id,
          quantidade_atual: row.estoque,
          data_validade: row.validade,
          last_updated: new Date().toISOString(),
        }, { onConflict: 'produto_id' });

      if (row.quantidade_vendida > 0) {
        await supabase
          .from('vendas')
          .insert({
            produto_id: product.id,
            quantidade_vendida: row.quantidade_vendida,
            data_venda: row.ultima_venda || new Date().toISOString().split('T')[0],
            valor_total: row.quantidade_vendida * row.preco_venda,
          });
      }
    }

    await supabase.from('uploads_history').insert({
      cliente_id: clienteId,
      nome_arquivo: file.name,
      status: report.status,
      linhas_processadas: report.validRows,
    });

    const alertsGenerated = await runAnalysis(clienteId, supabase);

    return NextResponse.json({
      message: 'Dados importados e analise concluida.',
      alertsGenerated,
      report,
    });
  } catch (error: unknown) {
    console.error('Erro no processamento do upload:', error);
    return NextResponse.json({
      error: 'Falha critica.',
      details: error instanceof Error ? error.message : 'Erro desconhecido.',
    }, { status: 500 });
  }
}
