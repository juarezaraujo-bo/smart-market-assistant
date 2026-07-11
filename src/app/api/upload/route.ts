import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ExcelService, type ProductRow } from '@/lib/excelService';
import { runAnalysis } from '@/lib/analysisEngine';

type SupabaseErrorInfo = {
  scope: string;
  etapa: string;
  tabela: string;
  row?: number;
  produto?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

type ClienteRecord = {
  id: string;
  nome_mercado?: string | null;
};

type ProdutoRecord = {
  id: string;
  nome: string;
};

type UploadSummary = {
  total_linhas: number;
  linhas_validas: number;
  produtos_inseridos: number;
  produtos_atualizados: number;
  estoques_inseridos: number;
  estoques_atualizados: number;
  vendas_inseridas: number;
  erros: SupabaseErrorInfo[];
};

const isDev = process.env.NODE_ENV === 'development';

function toSupabaseErrorInfo(
  scope: string,
  error: { message?: string; details?: string | null; hint?: string | null; code?: string | null },
  row?: number,
  produto?: string
): SupabaseErrorInfo {
  const [tabela, etapa] = scope.split('.');

  return {
    scope,
    etapa: etapa || scope,
    tabela: tabela || scope,
    row,
    produto,
    message: error.message || 'Erro desconhecido do Supabase.',
    details: error.details ?? null,
    hint: error.hint ?? null,
    code: error.code ?? null,
  };
}

function logDebug(label: string, payload: unknown) {
  if (isDev) console.log(label, payload);
}

function logSupabaseError(error: SupabaseErrorInfo) {
  if (isDev) console.error('[Upload Supabase Error]', error);
}

function createSupabaseClients(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase nao configurado.');
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const dbClient = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: supabaseServiceRoleKey
      ? undefined
      : {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
  });

  logDebug('[Upload Supabase Client]', {
    usingServiceRole: Boolean(supabaseServiceRoleKey),
  });

  return { authClient, dbClient };
}

async function findClienteForUser(dbClient: SupabaseClient, userId: string): Promise<ClienteRecord | null> {
  const { data, error } = await dbClient
    .from('clientes')
    .select('id, nome_mercado')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { supabaseError: error, scope: 'clientes.select' });
  }

  return data as ClienteRecord | null;
}

async function findProduto(dbClient: SupabaseClient, clienteId: string, nome: string) {
  return dbClient
    .from('produtos')
    .select('id, nome')
    .eq('cliente_id', clienteId)
    .eq('nome', nome)
    .maybeSingle();
}

async function insertProduto(dbClient: SupabaseClient, clienteId: string, row: ProductRow) {
  const payload = {
    cliente_id: clienteId,
    nome: row.produto.trim(),
    categoria: row.categoria.trim(),
    preco_custo: row.custo,
    preco_venda: row.preco_venda,
    quantidade_vendida: row.quantidade_vendida,
    ultima_venda: row.ultima_venda,
    updated_at: new Date().toISOString(),
  };

  logDebug('[Upload Produtos Insert Payload]', payload);

  return dbClient
    .from('produtos')
    .insert(payload)
    .select('id, nome')
    .single();
}

async function updateProduto(dbClient: SupabaseClient, productId: string, row: ProductRow) {
  const payload = {
    categoria: row.categoria.trim(),
    preco_custo: row.custo,
    preco_venda: row.preco_venda,
    quantidade_vendida: row.quantidade_vendida,
    ultima_venda: row.ultima_venda,
    updated_at: new Date().toISOString(),
  };

  logDebug('[Upload Produtos Update Payload]', {
    productId,
    ...payload,
  });

  return dbClient
    .from('produtos')
    .update(payload)
    .eq('id', productId)
    .select('id, nome')
    .single();
}

async function persistProduto(
  dbClient: SupabaseClient,
  clienteId: string,
  row: ProductRow,
  rowNumber: number,
  summary: UploadSummary
): Promise<ProdutoRecord | null> {
  const nome = row.produto.trim();
  const { data: existingProduct, error: findError } = await findProduto(dbClient, clienteId, nome);

  if (findError) {
    const error = toSupabaseErrorInfo('produtos.select', findError, rowNumber, nome);
    summary.erros.push(error);
    logSupabaseError(error);
    return null;
  }

  const result = existingProduct
    ? await updateProduto(dbClient, existingProduct.id, row)
    : await insertProduto(dbClient, clienteId, row);

  logDebug('[Upload Produtos Supabase Result]', {
    row: rowNumber,
    produto: nome,
    operation: existingProduct ? 'update' : 'insert',
    data: result.data,
    error: result.error,
  });

  if (result.error || !result.data) {
    const error = toSupabaseErrorInfo(
      existingProduct ? 'produtos.update' : 'produtos.insert',
      result.error || { message: 'Produto nao retornado apos gravacao.' },
      rowNumber,
      nome
    );
    summary.erros.push(error);
    logSupabaseError(error);
    return null;
  }

  if (existingProduct) summary.produtos_atualizados++;
  else summary.produtos_inseridos++;

  return result.data as ProdutoRecord;
}

async function persistEstoque(
  dbClient: SupabaseClient,
  produto: ProdutoRecord,
  row: ProductRow,
  rowNumber: number,
  summary: UploadSummary
) {
  const { data: existingStock, error: findError } = await dbClient
    .from('estoque')
    .select('id')
    .eq('produto_id', produto.id)
    .maybeSingle();

  if (findError) {
    const error = toSupabaseErrorInfo('estoque.select', findError, rowNumber, produto.nome);
    summary.erros.push(error);
    logSupabaseError(error);
    return;
  }

  const payload = {
    produto_id: produto.id,
    quantidade_atual: row.estoque,
    data_validade: row.validade,
    last_updated: new Date().toISOString(),
  };

  logDebug('[Upload Estoque Payload]', {
    row: rowNumber,
    produto: produto.nome,
    operation: existingStock ? 'update' : 'insert',
    payload,
  });

  const result = existingStock
    ? await dbClient.from('estoque').update(payload).eq('id', existingStock.id)
    : await dbClient.from('estoque').insert(payload);

  if (result.error) {
    const error = toSupabaseErrorInfo(
      existingStock ? 'estoque.update' : 'estoque.insert',
      result.error,
      rowNumber,
      produto.nome
    );
    summary.erros.push(error);
    logSupabaseError(error);
    return;
  }

  if (existingStock) summary.estoques_atualizados++;
  else summary.estoques_inseridos++;
}

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('authorization');
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    }

    const { authClient, dbClient } = createSupabaseClients(accessToken);

    const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !user) {
      return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    }

    logDebug('[Upload Auth User]', {
      userId: user.id,
      email: user.email,
    });

    const cliente = await findClienteForUser(dbClient, user.id);
    if (!cliente) {
      return NextResponse.json({ error: 'Mercado nao encontrado para o usuario autenticado.' }, { status: 403 });
    }

    logDebug('[Upload Cliente Found]', cliente);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });

    const report = await ExcelService.parseFile(file);
    const summary: UploadSummary = {
      total_linhas: report.totalRows,
      linhas_validas: report.validRows,
      produtos_inseridos: 0,
      produtos_atualizados: 0,
      estoques_inseridos: 0,
      estoques_atualizados: 0,
      vendas_inseridas: 0,
      erros: [],
    };

    logDebug('[Upload Parse Summary]', {
      file: file.name,
      cliente_id: cliente.id,
      total_linhas: report.totalRows,
      linhas_validas: report.validRows,
      rejectedRows: report.rejectedRows,
      validationErrors: report.errors,
      diagnostics: report.diagnostics,
      firstValidRow: report.data[0],
    });

    if (report.status === 'failed') {
      return NextResponse.json({
        error: report.validRows === 0 ? 'Nenhuma linha valida encontrada no CSV.' : 'Falha na validacao dos dados.',
        total_linhas: summary.total_linhas,
        linhas_validas: summary.linhas_validas,
        produtos_validos: summary.linhas_validas,
        produtos_inseridos: 0,
        produtos_atualizados: 0,
        erros: report.errors,
        diagnostico_parser: report.diagnostics,
      }, { status: 400 });
    }

    for (const [index, row] of report.data.entries()) {
      const rowNumber = index + 2;
      const produto = await persistProduto(dbClient, cliente.id, row, rowNumber, summary);
      if (!produto) continue;

      await persistEstoque(dbClient, produto, row, rowNumber, summary);
      if (row.quantidade_vendida > 0) summary.vendas_inseridas++;
    }

    const produtosPersistidos = summary.produtos_inseridos + summary.produtos_atualizados;
    const { count: produtosNoBanco, error: verifyError } = await dbClient
      .from('produtos')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', cliente.id);

    if (verifyError) {
      const error = toSupabaseErrorInfo('produtos.verify', verifyError);
      summary.erros.push(error);
      logSupabaseError(error);
    }

    logDebug('[Upload Persist Summary]', {
      ...summary,
      cliente_id: cliente.id,
      produtos_no_banco: produtosNoBanco,
    });

    if (report.validRows > 0 && produtosPersistidos === 0) {
      return NextResponse.json({
        error: 'Nenhum produto valido foi persistido no Supabase.',
        produtos_validos: summary.linhas_validas,
        ...summary,
      }, { status: 500 });
    }

    if (report.validRows > 0 && (produtosNoBanco ?? 0) === 0) {
      return NextResponse.json({
        error: 'A gravacao terminou sem produtos visiveis na tabela produtos.',
        produtos_validos: summary.linhas_validas,
        ...summary,
      }, { status: 500 });
    }

    const { error: uploadHistoryError } = await dbClient.from('uploads_history').insert({
      cliente_id: cliente.id,
      nome_arquivo: file.name,
      status: summary.erros.length > 0 ? 'partial' : report.status,
      linhas_processadas: report.validRows,
    });

    if (uploadHistoryError) {
      const error = toSupabaseErrorInfo('uploads_history.insert', uploadHistoryError);
      summary.erros.push(error);
      logSupabaseError(error);
    }

    const alertsGenerated = await runAnalysis(cliente.id, dbClient);

    return NextResponse.json({
      message: 'Dados importados e analise concluida.',
      total_linhas: summary.total_linhas,
      linhas_validas: summary.linhas_validas,
      produtos_validos: summary.linhas_validas,
      produtos_inseridos: summary.produtos_inseridos,
      produtos_atualizados: summary.produtos_atualizados,
      erros: summary.erros,
      estoques_inseridos: summary.estoques_inseridos,
      estoques_atualizados: summary.estoques_atualizados,
      vendas_inseridas: summary.vendas_inseridas,
      alertas_gerados: alertsGenerated,
      cliente_id: cliente.id,
    });
  } catch (error: unknown) {
    const maybeSupabaseError = error as { supabaseError?: { message?: string; details?: string | null; hint?: string | null; code?: string | null }; scope?: string };
    if (maybeSupabaseError.supabaseError) {
      const supabaseError = toSupabaseErrorInfo(maybeSupabaseError.scope || 'supabase', maybeSupabaseError.supabaseError);
      logSupabaseError(supabaseError);
      return NextResponse.json({ error: supabaseError.message, erros: [supabaseError] }, { status: 500 });
    }

    console.error('Erro no processamento do upload:', error);
    return NextResponse.json({
      error: 'Falha critica.',
      details: error instanceof Error ? error.message : 'Erro desconhecido.',
    }, { status: 500 });
  }
}
