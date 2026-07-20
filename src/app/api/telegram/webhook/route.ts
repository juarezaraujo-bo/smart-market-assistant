import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { sendTelegramChatAction, sendTelegramMessage } from '@/lib/telegramService';
import { runSmartMarketAssistant } from '@/lib/assistant/assistantOrchestrator';
import { consultarRecomendacoes, consultarResumoDecisoes } from '@/lib/assistant/assistantTools';
import { splitTelegramMessage } from '@/lib/assistant/telegramMessageFormatter';
import type { AssistantConnection } from '@/lib/assistant/assistantTypes';

type TelegramUpdate = {
  update_id?: number;
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

type SupabaseError = {
  code?: string;
  message?: string;
};

const PROCESSING_RECOVERY_MINUTES = 15;

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
  '',
  'Também pode perguntar em linguagem natural, como:',
  'O que preciso repor?',
  'Onde tenho mais dinheiro parado?',
  'Como está a cerveja?',
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

function validateWebhookSecret(request: NextRequest) {
  const configured = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!configured) {
    return process.env.NODE_ENV !== 'production' && process.env.TELEGRAM_WEBHOOK_ALLOW_UNSAFE_LOCAL === 'true';
  }

  return request.headers.get('x-telegram-bot-api-secret-token') === configured;
}

function isDuplicateKeyError(error: SupabaseError | null) {
  return error?.code === '23505';
}

async function reserveUpdate(supabase: SupabaseClient, updateId: number, chatId: string) {
  const { error: insertError } = await supabase
    .from('telegram_processed_updates')
    .insert({
      update_id: updateId,
      chat_id: chatId,
      status: 'processing',
      error_code: null,
    });

  if (!insertError) return true;
  if (!isDuplicateKeyError(insertError)) throw new Error(insertError.message);

  const recoveryCutoff = new Date(Date.now() - PROCESSING_RECOVERY_MINUTES * 60 * 1000).toISOString();
  const { data: recovered, error: recoveryError } = await supabase
    .from('telegram_processed_updates')
    .update({
      status: 'processing',
      error_code: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    })
    .eq('update_id', updateId)
    .eq('status', 'processing')
    .lt('created_at', recoveryCutoff)
    .select('update_id')
    .maybeSingle();

  if (recoveryError) throw new Error(recoveryError.message);
  return Boolean(recovered);
}

async function completeUpdate(supabase: SupabaseClient, updateId: number, status: 'completed' | 'failed', errorCode?: string) {
  await supabase
    .from('telegram_processed_updates')
    .update({
      status,
      completed_at: new Date().toISOString(),
      error_code: errorCode || null,
    })
    .eq('update_id', updateId);
}

async function resolveTelegramConnection(supabase: SupabaseClient, chatId: string) {
  const { data, error } = await supabase
    .from('telegram_connections')
    .select('cliente_id, chat_id, telegram_username, telegram_first_name, ativo')
    .eq('chat_id', chatId)
    .eq('ativo', true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AssistantConnection | null;
}

function formatRecommendationList(title: string, payload: Awaited<ReturnType<typeof consultarRecomendacoes>>) {
  if (payload.recomendacoes.length === 0) {
    return `${title}\n\nNenhum item encontrado.`;
  }

  const lines = payload.recomendacoes.map((item, index) => [
    `${index + 1}. ${item.nome || 'Produto não identificado'}`,
    item.diagnostico,
    `Ação: ${item.acao_recomendada}`,
  ].join('\n'));

  return [
    title,
    '',
    ...lines,
    '',
    payload.periodo ? `Período analisado: ${payload.periodo.periodo_inicio} a ${payload.periodo.periodo_fim}` : '',
  ].join('\n').trim();
}

async function getResponseForCommand(command: string | null, clienteId: string, supabase: SupabaseClient) {
  const context = { clienteId, supabase };

  if (command === '/start' || command === '/ajuda') return HELP_MESSAGE;
  if (command === '/resumo') {
    const payload = await consultarResumoDecisoes(context, {});
    return [
      'Resumo SmartMarket',
      '',
      `Produtos analisados: ${payload.produtos_analisados}`,
      `Críticas: ${payload.resumo.criticas}`,
      `Altas: ${payload.resumo.altas}`,
      `Médias: ${payload.resumo.medias}`,
      `Capital em risco: R$ ${payload.resumo.capital_em_risco.toFixed(2)}`,
      '',
      payload.periodo ? `Período analisado: ${payload.periodo.periodo_inicio} a ${payload.periodo.periodo_fim}` : 'Período analisado: não encontrado.',
    ].join('\n');
  }

  if (command === '/criticos') {
    return formatRecommendationList('Prioridades críticas', await consultarRecomendacoes(context, {
      severidade: 'critica',
      limite: 10,
    }));
  }

  if (command === '/vencimentos') {
    return formatRecommendationList('Vencimentos e validade', await consultarRecomendacoes(context, {
      recomendacao: 'RISCO_VENCIMENTO',
      limite: 10,
    }));
  }

  if (command === '/ruptura') {
    return formatRecommendationList('Risco de ruptura e reposição', await consultarRecomendacoes(context, {
      recomendacao: 'RISCO_RUPTURA',
      limite: 10,
    }));
  }

  if (command === '/parados') {
    return formatRecommendationList('Produtos parados ou com excesso', await consultarRecomendacoes(context, {
      recomendacao: 'CAPITAL_PARADO',
      limite: 10,
    }));
  }

  return null;
}

async function sendLongTelegramMessage(message: string, chatId: string) {
  for (const part of splitTelegramMessage(message)) {
    await sendTelegramMessage(part, chatId);
  }
}

export async function POST(request: NextRequest) {
  let updateId: number | null = null;
  let chatIdText: string | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    if (!validateWebhookSecret(request)) {
      return NextResponse.json({ ok: true });
    }

    const update = (await request.json()) as TelegramUpdate;
    updateId = typeof update.update_id === 'number' ? update.update_id : null;
    const chatId = update.message?.chat?.id;
    const text = update.message?.text || '';
    chatIdText = chatId === undefined || chatId === null ? null : String(chatId);

    if (!chatIdText || !text || updateId === null) {
      return NextResponse.json({ ok: true });
    }

    supabase = getSupabaseAdminClient();

    const reserved = await reserveUpdate(supabase, updateId, chatIdText);
    if (!reserved) {
      return NextResponse.json({ ok: true });
    }

    const connection = await resolveTelegramConnection(supabase, chatIdText);
    if (!connection) {
      await sendTelegramMessage('Este Telegram ainda não está vinculado a um mercado no SmartMarket.', chatIdText);
      await completeUpdate(supabase, updateId, 'completed');
      return NextResponse.json({ ok: true });
    }

    await sendTelegramChatAction(chatIdText, 'typing').catch(() => undefined);

    const command = resolveCommand(text);
    const commandMessage = await getResponseForCommand(command, connection.cliente_id, supabase);
    const responseMessage = commandMessage || (await runSmartMarketAssistant({
      clienteId: connection.cliente_id,
      chatId: chatIdText,
      userText: text,
      supabase,
    })).message;

    await sendLongTelegramMessage(responseMessage, chatIdText);
    await completeUpdate(supabase, updateId, 'completed');

    return NextResponse.json({ ok: true });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 80) : 'unknown_error';
    console.error('[Telegram Webhook] Erro ao processar atualização:', {
      update_id: updateId,
      chat_id: chatIdText,
      error_code: errorCode,
    });

    if (supabase && updateId !== null) {
      await completeUpdate(supabase, updateId, 'failed', errorCode).catch(() => undefined);
    }

    if (chatIdText) {
      await sendTelegramMessage('Não consegui consultar os dados agora. Tente novamente em alguns instantes.', chatIdText)
        .catch(() => undefined);
    }

    return NextResponse.json({ ok: true });
  }
}
