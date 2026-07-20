import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Response,
  ResponseFunctionToolCall,
  ResponseInputItem,
  Tool,
} from 'openai/resources/responses/responses';
import { generateProductRecommendations } from '@/lib/analytics/productRecommendations';
import { getProductMetricsForClient } from '@/lib/analytics/productAnalyticsService';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { SMARTMARKET_ASSISTANT_INSTRUCTIONS } from './assistantInstructions';
import {
  formatFallbackRecommendationsMessage,
  type RecommendationIntent,
} from './assistantPresentation';
import { assistantOpenAITools } from './assistantToolSchemas';
import { executeAssistantTool, listarPeriodos } from './assistantTools';
import {
  createOpenAIClient,
  getAssistantModel,
  isSmartMarketAiEnabled,
  sanitizeOpenAIError,
} from './openaiClient';
import { limitAssistantAnswer } from './telegramMessageFormatter';
import type {
  AssistantContext,
  AssistantMessage,
  AssistantRunResult,
  AssistantToolCallLog,
  AssistantToolName,
} from './assistantTypes';

const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_CALLS = 8;
const MAX_STORED_MESSAGE_LENGTH = 2000;
const SMARTMARKET_AI_DISABLED_MESSAGE = 'O assistente inteligente está temporariamente disponível apenas para comandos fixos.';
const SAFE_FAILURE_MESSAGE = 'Não consegui consultar os dados agora. Tente novamente em alguns instantes.';

type ConversationRow = {
  id: string;
  ultimo_periodo_inicio: string | null;
  ultimo_periodo_fim: string | null;
};

type ClientNameRow = {
  nome_mercado: string | null;
};

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function truncateStoredMessage(value: string) {
  return value.length > MAX_STORED_MESSAGE_LENGTH
    ? value.slice(0, MAX_STORED_MESSAGE_LENGTH)
    : value;
}

function isToolCall(item: Response['output'][number]): item is ResponseFunctionToolCall {
  return item.type === 'function_call';
}

function parseArguments(argumentsText: string) {
  try {
    const parsed = JSON.parse(argumentsText) as unknown;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function extractUsage(response: Response) {
  const usage = response.usage;
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

async function getOrCreateConversation(supabase: SupabaseClient, clienteId: string, chatId: string) {
  const { data: existing, error: existingError } = await supabase
    .from('assistant_conversations')
    .select('id, ultimo_periodo_inicio, ultimo_periodo_fim')
    .eq('cliente_id', clienteId)
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return existing as ConversationRow;

  const { data, error } = await supabase
    .from('assistant_conversations')
    .insert({
      cliente_id: clienteId,
      telegram_chat_id: chatId,
    })
    .select('id, ultimo_periodo_inicio, ultimo_periodo_fim')
    .single();

  if (error) throw new Error(error.message);
  return data as ConversationRow;
}

async function tryGetConversation(supabase: SupabaseClient, clienteId: string, chatId: string) {
  try {
    return await getOrCreateConversation(supabase, clienteId, chatId);
  } catch (error) {
    console.warn('[SmartMarket Assistant] Memoria indisponivel:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

async function loadRecentMessages(supabase: SupabaseClient, conversationId: string) {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return ((data || []) as AssistantMessage[]).reverse();
}

async function saveConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  userText: string,
  assistantText: string
) {
  const { error } = await supabase
    .from('assistant_messages')
    .insert([
      { conversation_id: conversationId, role: 'user', content: truncateStoredMessage(userText) },
      { conversation_id: conversationId, role: 'assistant', content: truncateStoredMessage(assistantText) },
    ]);

  if (error) throw new Error(error.message);
}

function buildInput(userText: string, recentMessages: AssistantMessage[]): ResponseInputItem[] {
  const messages = recentMessages.map((message) => ({
    type: 'message' as const,
    role: message.role,
    content: message.content,
  }));

  return [
    ...messages,
    {
      type: 'message',
      role: 'user',
      content: userText,
    },
  ];
}

function fallbackIntent(text: string): RecommendationIntent | null {
  const normalized = normalizeText(text);
  if (['prioridade', 'prioridades', 'este mes'].some((term) => normalized.includes(term))) return 'prioridades';
  if (['repor', 'reposicao', 'ruptura', 'acabando'].some((term) => normalized.includes(term))) return 'repor';
  if (['parado', 'parados', 'dinheiro parado', 'capital'].some((term) => normalized.includes(term))) return 'capital';
  if (['vencimento', 'validade', 'vencer'].some((term) => normalized.includes(term))) return 'vencimento';
  if (['promocao', 'promocoes', 'combo'].some((term) => normalized.includes(term))) return 'promocao';
  return null;
}

async function getMarketDisplayName(supabase: SupabaseClient, clienteId: string, fallback?: string) {
  if (fallback) return fallback;

  const { data, error } = await supabase
    .from('clientes')
    .select('nome_mercado')
    .eq('id', clienteId)
    .maybeSingle();

  if (error) {
    console.warn('[SmartMarket Assistant] Nome do mercado indisponivel:', error.message);
  }

  const row = data as ClientNameRow | null;
  return row?.nome_mercado || 'SmartMarket';
}

async function deterministicFallback(context: AssistantContext): Promise<AssistantRunResult | null> {
  const intent = fallbackIntent(context.userText);
  if (!intent) return null;

  const supabase = context.supabase || getSupabaseAdminClient();
  const marketName = await getMarketDisplayName(supabase, context.clienteId, context.marketName);
  const periods = await listarPeriodos({ clienteId: context.clienteId, supabase });
  const latest = periods.periodo_mais_recente;
  const metrics = await getProductMetricsForClient(supabase, context.clienteId, {
    periodoInicio: latest?.periodo_inicio || null,
    periodoFim: latest?.periodo_fim || null,
    produtoId: null,
    categoria: null,
    limite: 500,
  });
  const recommendations = generateProductRecommendations(metrics);
  const filtered = recommendations.filter((item) => {
    if (intent === 'repor') {
      return item.recomendacao_principal === 'RISCO_RUPTURA' || item.recomendacao_principal === 'REPOSICAO_PRIORITARIA';
    }
    if (intent === 'vencimento') return item.recomendacao_principal === 'RISCO_VENCIMENTO' || item.recomendacao_principal === 'PRODUTO_VENCIDO';
    if (intent === 'capital') return item.recomendacao_principal === 'CAPITAL_PARADO' || item.recomendacao_principal === 'EXCESSO_ESTOQUE';
    if (intent === 'promocao') return item.acao_recomendada === 'CRIAR_PROMOCAO' || item.acao_recomendada === 'CRIAR_COMBO';
    return true;
  }).slice(0, 5);

  return {
    message: limitAssistantAnswer(formatFallbackRecommendationsMessage({
      intent,
      marketName,
      period: latest,
      recommendations: filtered,
    })),
    usedFallback: true,
    toolCalls: [],
    model: null,
    period: latest,
  };
}

export async function runSmartMarketAssistant(context: AssistantContext): Promise<AssistantRunResult> {
  const startedAt = Date.now();
  const supabase = context.supabase || getSupabaseAdminClient();
  const conversation = await tryGetConversation(supabase, context.clienteId, context.chatId);
  const recentMessages = context.recentMessages || (conversation ? await loadRecentMessages(supabase, conversation.id) : []);
  const fallback = await deterministicFallback({ ...context, supabase, recentMessages });

  if (!isSmartMarketAiEnabled()) {
    const result = fallback || {
      message: SMARTMARKET_AI_DISABLED_MESSAGE,
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: null,
    };
    if (conversation) {
      await saveConversationMessages(supabase, conversation.id, context.userText, result.message);
    }
    return result;
  }

  try {
    const client = createOpenAIClient();
    const model = getAssistantModel();
    let input = buildInput(context.userText, recentMessages);
    const toolLogs: AssistantToolCallLog[] = [];
    let totalCalls = 0;
    let finalResponse: Response | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.responses.create({
        model,
        instructions: SMARTMARKET_ASSISTANT_INSTRUCTIONS,
        input,
        tools: assistantOpenAITools as unknown as Tool[],
        store: false,
        max_output_tokens: 900,
      });

      const toolCalls = response.output.filter(isToolCall);
      if (toolCalls.length === 0) {
        finalResponse = response;
        break;
      }

      if (totalCalls + toolCalls.length > MAX_TOOL_CALLS) {
        return {
          message: 'Não consegui concluir essa consulta com segurança. Tente fazer uma pergunta mais específica.',
          usedFallback: false,
          toolCalls: toolLogs,
          model,
          usage: extractUsage(response),
        };
      }

      totalCalls += toolCalls.length;
      const toolOutputs: ResponseInputItem[] = [];

      for (const call of toolCalls) {
        const toolStartedAt = Date.now();
        const toolName = call.name as AssistantToolName;
        try {
          const output = await executeAssistantTool(
            toolName,
            parseArguments(call.arguments),
            { clienteId: context.clienteId, supabase }
          );
          toolLogs.push({
            name: toolName,
            durationMs: Date.now() - toolStartedAt,
            success: true,
          });
          toolOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify(output),
          });
        } catch (error) {
          const code = error instanceof Error ? error.message.slice(0, 80) : 'tool_error';
          toolLogs.push({
            name: toolName,
            durationMs: Date.now() - toolStartedAt,
            success: false,
            errorCode: code,
          });
          toolOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify({ error: 'Ferramenta rejeitada ou indisponível.' }),
          });
        }
      }

      input = [
        ...input,
        ...toolCalls,
        ...toolOutputs,
      ];
    }

    if (!finalResponse) {
      throw new Error('Resposta incompleta.');
    }

    const answer = limitAssistantAnswer(finalResponse.output_text || SAFE_FAILURE_MESSAGE);
    if (conversation) {
      await saveConversationMessages(supabase, conversation.id, context.userText, answer);
    }

    console.info('[SmartMarket Assistant]', {
      cliente_id: context.clienteId,
      chat_id: context.chatId,
      status: 'completed',
      duration_ms: Date.now() - startedAt,
      model,
      tool_calls: toolLogs.length,
      tokens: extractUsage(finalResponse),
    });

    return {
      message: answer,
      usedFallback: false,
      toolCalls: toolLogs,
      model,
      usage: extractUsage(finalResponse),
    };
  } catch (error) {
    const code = sanitizeOpenAIError(error);
    console.warn('[SmartMarket Assistant]', {
      cliente_id: context.clienteId,
      chat_id: context.chatId,
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      error_code: code,
    });

    if (fallback) {
      if (conversation) {
        await saveConversationMessages(supabase, conversation.id, context.userText, fallback.message);
      }
      return fallback;
    }

    return {
      message: SAFE_FAILURE_MESSAGE,
      usedFallback: true,
      toolCalls: [],
      model: null,
    };
  }
}
