import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from './supabaseAdmin';

type TelegramSendResult = {
  ok: boolean;
  result?: {
    message_id?: number;
  };
  description?: string;
};

type PendingTelegramAlert = {
  id: string;
  cliente_id: string;
  produto_id: string | null;
  tipo: string | null;
  mensagem: string;
  whatsapp_status: string | null;
  produtos?: {
    nome: string | null;
  } | Array<{
    nome: string | null;
  }> | null;
};

export type TelegramProcessDetail = {
  alertId: string;
  produto: string;
  tipo: string;
  status: 'sent' | 'failed' | 'skipped';
  message?: string;
  error?: string;
};

function requireTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN não configurado.');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID não configurado.');

  return { botToken, chatId };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getProdutoNome(alert: PendingTelegramAlert) {
  if (Array.isArray(alert.produtos)) {
    return alert.produtos[0]?.nome || 'Produto não identificado';
  }

  return alert.produtos?.nome || 'Produto não identificado';
}

function formatAlertMessage(alert: PendingTelegramAlert) {
  const produto = getProdutoNome(alert);
  const tipo = alert.tipo || 'alerta';

  return [
    '🚨 <b>SmartMarket Alerta</b>',
    '',
    `<b>Tipo:</b> ${escapeHtml(tipo)}`,
    `<b>Produto:</b> ${escapeHtml(produto)}`,
    `<b>Mensagem:</b> ${escapeHtml(alert.mensagem)}`,
    '',
    'Ação recomendada: verificar no painel.',
  ].join('\n');
}

export async function sendTelegramMessage(message: string) {
  const { botToken, chatId } = requireTelegramConfig();
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  const payload = (await response.json()) as TelegramSendResult;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram retornou HTTP ${response.status}.`);
  }

  return payload;
}

async function reserveAlertForTelegram(client: SupabaseClient, alertId: string) {
  const { data, error } = await client
    .from('alertas')
    .update({
      whatsapp_status: 'processing',
      whatsapp_tentativas: 1,
    })
    .eq('id', alertId)
    .eq('whatsapp_status', 'pending')
    .select('id')
    .single();

  if (error || !data) return false;
  return true;
}

export async function processPendingTelegramAlerts() {
  requireTelegramConfig();

  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from('alertas')
    .select(`
      id,
      cliente_id,
      produto_id,
      tipo,
      mensagem,
      whatsapp_status,
      produtos:produto_id (
        nome
      )
    `)
    .eq('whatsapp_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Erro ao buscar alertas pendentes: ${error.message}`);
  }

  const alerts = (data || []) as unknown as PendingTelegramAlert[];
  const details: TelegramProcessDetail[] = [];
  let sent = 0;
  let failed = 0;

  for (const alert of alerts) {
    const produto = getProdutoNome(alert);
    const tipo = alert.tipo || 'alerta';
    const reserved = await reserveAlertForTelegram(client, alert.id);

    if (!reserved) {
      details.push({
        alertId: alert.id,
        produto,
        tipo,
        status: 'skipped',
        message: 'Alerta já estava reservado ou processado.',
      });
      continue;
    }

    try {
      const telegramResponse = await sendTelegramMessage(formatAlertMessage(alert));
      await client
        .from('alertas')
        .update({
          whatsapp_status: 'sent',
          whatsapp_message_id: telegramResponse.result?.message_id
            ? `telegram:${telegramResponse.result.message_id}`
            : null,
          whatsapp_data_envio: new Date().toISOString(),
          whatsapp_ultimo_erro: null,
        })
        .eq('id', alert.id);

      sent++;
      details.push({
        alertId: alert.id,
        produto,
        tipo,
        status: 'sent',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao enviar Telegram.';

      await client
        .from('alertas')
        .update({
          whatsapp_status: 'failed',
          whatsapp_ultimo_erro: message,
        })
        .eq('id', alert.id);

      failed++;
      details.push({
        alertId: alert.id,
        produto,
        tipo,
        status: 'failed',
        error: message,
      });
    }
  }

  return {
    total: alerts.length,
    sent,
    failed,
    details,
  };
}
