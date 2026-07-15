import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { sendTelegramMessage } from '@/lib/telegramService';

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: string | number;
    };
    text?: string;
    from?: {
      first_name?: string;
      username?: string;
    };
  };
};

type ProdutoInfo = {
  nome: string | null;
  preco_custo?: number | string | null;
  estoque?: Array<{
    quantidade_atual: number | string | null;
  }> | null;
};

type AlertRecord = {
  id: string;
  tipo: string | null;
  mensagem: string;
  whatsapp_status: string | null;
  created_at: string;
  produtos?: ProdutoInfo | ProdutoInfo[] | null;
};

type UploadRecord = {
  created_at: string;
};

const HELP_MESSAGE = [
  'Olá! Eu sou o bot do SmartMarket.',
  '',
  'Você pode usar:',
  '/resumo',
  '/criticos',
  '/vencimentos',
  '/ruptura',
  '/parados',
  '/ajuda',
].join('\n');

const UNKNOWN_MESSAGE = [
  'Não entendi sua solicitação.',
  '',
  'Você pode usar:',
  '/resumo',
  '/criticos',
  '/vencimentos',
  '/ruptura',
  '/parados',
  '/ajuda',
].join('\n');

function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveCommand(text: string) {
  const normalized = normalizeText(text);

  if (normalized.startsWith('/start')) return '/start';
  if (normalized.startsWith('/ajuda')) return '/ajuda';
  if (normalized.startsWith('/resumo')) return '/resumo';
  if (normalized.startsWith('/criticos')) return '/criticos';
  if (normalized.startsWith('/vencimentos')) return '/vencimentos';
  if (normalized.startsWith('/ruptura')) return '/ruptura';
  if (normalized.startsWith('/parados')) return '/parados';

  if (['critico', 'criticos', 'situacao critica'].some((term) => normalized.includes(term))) {
    return '/criticos';
  }

  if (['resumo', 'geral', 'situacao do mercado'].some((term) => normalized.includes(term))) {
    return '/resumo';
  }

  if (['vencimento', 'validade', 'vencendo'].some((term) => normalized.includes(term))) {
    return '/vencimentos';
  }

  if (['ruptura', 'acabando', 'zerar'].some((term) => normalized.includes(term))) {
    return '/ruptura';
  }

  if (['parado', 'parados', 'sem venda', 'encalhado'].some((term) => normalized.includes(term))) {
    return '/parados';
  }

  return null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getProduto(alert: AlertRecord) {
  if (Array.isArray(alert.produtos)) return alert.produtos[0] || null;
  return alert.produtos || null;
}

function getEstoqueAtual(produto: ProdutoInfo | null) {
  const estoque = produto?.estoque?.[0]?.quantidade_atual;
  if (estoque === undefined || estoque === null) return null;
  const value = Number(estoque);
  return Number.isFinite(value) ? value : null;
}

function getValorFinanceiro(produto: ProdutoInfo | null) {
  const estoque = getEstoqueAtual(produto);
  const precoCusto = produto?.preco_custo === undefined || produto?.preco_custo === null
    ? null
    : Number(produto.preco_custo);

  if (estoque === null || precoCusto === null || !Number.isFinite(precoCusto)) return null;
  return estoque * precoCusto;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'não encontrada';
  return new Date(value).toLocaleString('pt-BR');
}

function formatAlertList(title: string, alerts: AlertRecord[]) {
  if (alerts.length === 0) {
    return `${title}\n\nNenhum alerta encontrado.`;
  }

  const lines = alerts.flatMap((alert, index) => {
    const produto = getProduto(alert);
    const produtoNome = produto?.nome || 'Produto não identificado';
    const estoque = getEstoqueAtual(produto);
    const valor = getValorFinanceiro(produto);
    const item = [
      `${index + 1}. <b>${escapeHtml(produtoNome)}</b>`,
      escapeHtml(alert.mensagem),
    ];

    if (estoque !== null) item.push(`Estoque atual: ${estoque} un`);
    if (valor !== null) item.push(`Valor em risco: R$ ${valor.toFixed(2)}`);

    return [...item, ''];
  });

  return [title, '', ...lines].join('\n').trim();
}

async function getResumoMessage() {
  const supabase = getSupabaseAdminClient();

  const [
    produtosResult,
    criticosResult,
    vencimentosResult,
    rupturaResult,
    paradosResult,
    uploadResult,
  ] = await Promise.all([
    supabase.from('produtos').select('id', { count: 'exact', head: true }),
    supabase.from('alertas').select('id', { count: 'exact', head: true }).eq('lido', false).eq('whatsapp_status', 'pending'),
    supabase.from('alertas').select('id', { count: 'exact', head: true }).eq('lido', false).eq('tipo', 'vencimento'),
    supabase.from('alertas').select('id', { count: 'exact', head: true }).eq('lido', false).eq('tipo', 'ruptura'),
    supabase.from('alertas').select('id', { count: 'exact', head: true }).eq('lido', false).eq('tipo', 'estoque_parado'),
    supabase.from('uploads_history').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const errors = [produtosResult, criticosResult, vencimentosResult, rupturaResult, paradosResult, uploadResult]
    .map((result) => result.error)
    .filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]?.message || 'Erro ao carregar resumo.');
  }

  const lastUpload = uploadResult.data as UploadRecord | null;

  return [
    '📊 <b>Resumo SmartMarket</b>',
    '',
    `Produtos monitorados: ${produtosResult.count || 0}`,
    `Alertas críticos: ${criticosResult.count || 0}`,
    `Vencimentos próximos: ${vencimentosResult.count || 0}`,
    `Risco de ruptura: ${rupturaResult.count || 0}`,
    `Produtos parados: ${paradosResult.count || 0}`,
    '',
    `Última importação: ${formatDateTime(lastUpload?.created_at)}`,
  ].join('\n');
}

async function getAlertsByCommand(command: string) {
  const supabase = getSupabaseAdminClient();
  let title = 'Alertas SmartMarket';
  let query = supabase
    .from('alertas')
    .select(`
      id,
      tipo,
      mensagem,
      whatsapp_status,
      created_at,
      produtos:produto_id (
        nome,
        preco_custo,
        estoque (
          quantidade_atual
        )
      )
    `)
    .eq('lido', false)
    .order('created_at', { ascending: false })
    .limit(10);

  if (command === '/criticos') {
    title = '🚨 Alertas críticos';
    query = query.eq('whatsapp_status', 'pending');
  } else if (command === '/vencimentos') {
    title = '⏰ Vencimentos próximos';
    query = query.eq('tipo', 'vencimento');
  } else if (command === '/ruptura') {
    title = '📉 Risco de ruptura';
    query = query.eq('tipo', 'ruptura');
  } else if (command === '/parados') {
    title = '📦 Produtos parados';
    query = query.eq('tipo', 'estoque_parado');
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return formatAlertList(title, (data || []) as unknown as AlertRecord[]);
}

async function getResponseForCommand(command: string | null) {
  if (command === '/start' || command === '/ajuda') return HELP_MESSAGE;
  if (command === '/resumo') return getResumoMessage();
  if (command === '/criticos' || command === '/vencimentos' || command === '/ruptura' || command === '/parados') {
    return getAlertsByCommand(command);
  }

  return UNKNOWN_MESSAGE;
}

export async function POST(request: NextRequest) {
  try {
    const update = (await request.json()) as TelegramUpdate;
    const chatId = update.message?.chat?.id;
    const text = update.message?.text || '';
    const firstName = update.message?.from?.first_name || '';
    const username = update.message?.from?.username || '';

    if (!chatId || !text) {
      return NextResponse.json({ ok: true });
    }

    const chatIdText = String(chatId);
    const authorizedChatId = process.env.TELEGRAM_CHAT_ID;

    if (chatIdText !== String(authorizedChatId || '')) {
      console.warn('[Telegram Webhook] Unauthorized chat', {
        chatId: chatIdText,
        firstName,
        username,
      });
      await sendTelegramMessage('Acesso não autorizado.', chatIdText);
      return NextResponse.json({ ok: true });
    }

    const command = resolveCommand(text);
    const responseMessage = await getResponseForCommand(command);
    await sendTelegramMessage(responseMessage, chatIdText);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Erro ao processar atualização:', error);
    return NextResponse.json({ ok: true });
  }
}
