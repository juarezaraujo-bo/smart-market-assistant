import type { SupabaseClient } from '@supabase/supabase-js';
import { generateProductRecommendations, type ProductRecommendation } from '@/lib/analytics/productRecommendations';
import { getProductMetricsForClient } from '@/lib/analytics/productAnalyticsService';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import {
  formatExecutiveSummaryResponse,
  formatFallbackRecommendationsMessage,
  formatFallbackProductLookupMessage,
  formatHelpResponse,
  formatPeriodComparisonResponse,
  formatRecommendationListResponse,
  formatUnknownResponse,
  getListTitle,
} from './assistantPresentation';
import { compararProdutoPeriodos, consultarProduto, listarPeriodos } from './assistantTools';
import { routeAssistantIntent } from './router/intentRouter';
import { normalizeIntentText } from './router/intentNormalizer';
import { extractProductTerm } from './router/intentExtractor';
import {
  isSmartMarketAiEnabled,
  sanitizeOpenAIError,
} from './openaiClient';
import { decideAssistantAiMode } from './ai/assistantAiGate';
import { buildAssistantAiContext } from './ai/assistantContextBuilder';
import { buildAssistantPrompt } from './ai/assistantPromptBuilder';
import { estimateAssistantCost, validateAssistantCostLimits } from './ai/assistantCostEstimator';
import { validateAssistantResponse } from './ai/assistantResponseValidator';
import { getAssistantLlmProvider } from './llm/providerFactory';
import { limitAssistantAnswer } from './telegramMessageFormatter';
import type {
  AssistantAiTelemetry,
  AssistantContext,
  AssistantMessage,
  AssistantRunResult,
} from './assistantTypes';

const MAX_STORED_MESSAGE_LENGTH = 2000;
const MAX_AI_OUTPUT_TOKENS = 900;
const DEFAULT_AI_TIMEOUT_MS = 25000;
const SMARTMARKET_AI_DISABLED_MESSAGE = 'O assistente inteligente está temporariamente disponível apenas para comandos fixos.';
const SAFE_FAILURE_MESSAGE = 'Não consegui consultar os dados agora. Tente novamente em alguns instantes.';
const SAFE_REFUSAL_MESSAGE = 'Não posso alterar dados, revelar informações internas ou executar comandos inseguros. Posso consultar produtos, prioridades, reposição, vencimentos e capital parado.';

type ConversationRow = {
  id: string;
  ultimo_periodo_inicio: string | null;
  ultimo_periodo_fim: string | null;
};

type ClientNameRow = {
  nome_mercado: string | null;
};

export function extractFallbackProductSearchTerm(text: string) {
  return extractProductTerm(text) || null;
}

function truncateStoredMessage(value: string) {
  return value.length > MAX_STORED_MESSAGE_LENGTH
    ? value.slice(0, MAX_STORED_MESSAGE_LENGTH)
    : value;
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

function getAiTimeoutMs() {
  const parsed = Number(process.env.SMARTMARKET_AI_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AI_TIMEOUT_MS;
}

function buildAiTelemetry(input: Omit<AssistantAiTelemetry, 'durationMs' | 'fallbackUsed'> & {
  startedAt: number;
  fallbackUsed: boolean;
}): AssistantAiTelemetry {
  const { startedAt, ...rest } = input;
  return {
    ...rest,
    durationMs: Date.now() - startedAt,
  };
}

function sameCategory(recommendation: ProductRecommendation, category?: string) {
  if (!category) return true;
  const left = normalizeIntentText(recommendation.categoria || '').normalized;
  const right = normalizeIntentText(category).normalized;
  return left === right || left.includes(right) || right.includes(left);
}

function filterRecommendationsForIntent(
  recommendations: ProductRecommendation[],
  intent: ReturnType<typeof routeAssistantIntent>['intent'],
  category?: string
) {
  const filtered = recommendations.filter((item) => sameCategory(item, category));

  if (intent === 'replenishment') {
    return filtered.filter((item) =>
      item.recomendacao_principal === 'RISCO_RUPTURA' ||
      item.recomendacao_principal === 'REPOSICAO_PRIORITARIA'
    );
  }
  if (intent === 'expiration') {
    return filtered
      .filter((item) => item.recomendacao_principal === 'RISCO_VENCIMENTO' || item.recomendacao_principal === 'PRODUTO_VENCIDO')
      .sort((a, b) => Number(a.metricas_relevantes.dias_ate_vencimento ?? 9999) - Number(b.metricas_relevantes.dias_ate_vencimento ?? 9999));
  }
  if (intent === 'idle_capital') {
    return filtered
      .filter((item) => item.recomendacao_principal === 'CAPITAL_PARADO' || item.recomendacao_principal === 'EXCESSO_ESTOQUE')
      .sort((a, b) => Number(b.metricas_relevantes.capital_estoque ?? 0) - Number(a.metricas_relevantes.capital_estoque ?? 0));
  }
  if (intent === 'stagnant_products') {
    return filtered
      .filter((item) => Number(item.metricas_relevantes.quantidade_vendida ?? 0) === 0 || item.recomendacao_principal === 'SEM_VENDAS')
      .sort((a, b) => Number(b.metricas_relevantes.dias_sem_venda ?? 0) - Number(a.metricas_relevantes.dias_sem_venda ?? 0));
  }
  if (intent === 'promotions') {
    return filtered
      .filter((item) => item.acao_recomendada === 'CRIAR_PROMOCAO' && item.simulacao_promocao?.melhor_cenario)
      .sort((a, b) =>
        Number(b.simulacao_promocao?.melhor_cenario?.ganho_economico_incremental ?? 0) -
        Number(a.simulacao_promocao?.melhor_cenario?.ganho_economico_incremental ?? 0)
      );
  }
  if (intent === 'sales_ranking') return filtered;
  if (intent === 'category_analysis') return filtered;

  return filtered;
}

async function deterministicFallback(context: AssistantContext): Promise<AssistantRunResult | null> {
  const supabase = context.supabase || getSupabaseAdminClient();
  const route = routeAssistantIntent(context.userText, context.recentMessages || []);
  if (route.intent === 'unknown') {
    return {
      message: limitAssistantAnswer(formatUnknownResponse()),
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: null,
    };
  }
  if (route.intent === 'help') {
    return {
      message: limitAssistantAnswer(formatHelpResponse()),
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: null,
    };
  }

  const marketName = await getMarketDisplayName(supabase, context.clienteId, context.marketName);
  const periods = await listarPeriodos({ clienteId: context.clienteId, supabase });
  const latest = periods.periodo_mais_recente;
  const limit = route.entities.limit || 5;

  if (route.intent === 'product_analysis') {
    const result = await consultarProduto({ clienteId: context.clienteId, supabase }, {
      produto: route.entities.productTerm || '',
      periodo_inicio: latest?.periodo_inicio,
      periodo_fim: latest?.periodo_fim,
    });

    return {
      message: limitAssistantAnswer(formatFallbackProductLookupMessage(result)),
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: latest,
    };
  }

  if (route.intent === 'period_comparison') {
    if (!route.entities.productTerm) {
      return {
        message: 'Preciso saber qual produto ou análise você deseja comparar.',
        usedFallback: true,
        toolCalls: [],
        model: null,
        period: latest,
      };
    }

    const comparison = await compararProdutoPeriodos({ clienteId: context.clienteId, supabase }, {
      produto: route.entities.productTerm,
    });

    if (comparison.status !== 'ok' || !comparison.atual || !comparison.anterior) {
      return {
        message: 'Não encontrei períodos suficientes para comparar.',
        usedFallback: true,
        toolCalls: [],
        model: null,
        period: latest,
      };
    }

    return {
      message: limitAssistantAnswer(formatPeriodComparisonResponse({
        productTerm: route.entities.productTerm,
        current: comparison.atual,
        previous: comparison.anterior,
        currentPeriod: comparison.periodo_atual,
        previousPeriod: comparison.periodo_anterior,
      })),
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: comparison.periodo_atual,
    };
  }

  const metrics = await getProductMetricsForClient(supabase, context.clienteId, {
    periodoInicio: latest?.periodo_inicio || null,
    periodoFim: latest?.periodo_fim || null,
    produtoId: null,
    categoria: null,
    limite: 500,
  });
  const recommendations = generateProductRecommendations(metrics);
  let filtered = filterRecommendationsForIntent(recommendations, route.intent, route.entities.category);

  if (route.intent === 'sales_ranking') {
    filtered = [...filtered].sort((a, b) => {
      const left = Number(a.metricas_relevantes.quantidade_vendida ?? 0);
      const right = Number(b.metricas_relevantes.quantidade_vendida ?? 0);
      return route.entities.salesDirection === 'least' ? left - right : right - left;
    });
  }

  if (route.intent === 'executive_summary') {
    return {
      message: limitAssistantAnswer(formatExecutiveSummaryResponse({
        marketName,
        period: latest,
        totalProducts: metrics.length,
        recommendations,
      })),
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: latest,
    };
  }

  if (route.intent === 'priorities') {
    return {
      message: limitAssistantAnswer(formatFallbackRecommendationsMessage({
        intent: 'prioridades',
        marketName,
        period: latest,
        recommendations: filtered.slice(0, limit),
      })),
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: latest,
    };
  }

  const mode = route.intent === 'idle_capital'
    ? 'capital'
    : route.intent === 'promotions'
      ? 'promotion'
      : route.intent === 'sales_ranking'
        ? 'sales'
        : 'default';

  return {
    message: limitAssistantAnswer(formatRecommendationListResponse({
      title: getListTitle(route.intent, route.entities.category, route.entities.salesDirection),
      period: latest,
      recommendations: filtered.slice(0, limit),
      emptyMessage: 'Não encontrei produtos para este filtro no período analisado.',
      mode,
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

  const gateDecision = decideAssistantAiMode(context.userText, recentMessages);

  if (gateDecision.mode === 'refuse') {
    const result: AssistantRunResult = {
      message: SAFE_REFUSAL_MESSAGE,
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: fallback?.period || null,
      aiTelemetry: buildAiTelemetry({
        startedAt,
        fallbackUsed: true,
        gateDecision,
        failureReason: gateDecision.reason,
      }),
    };
    if (conversation) {
      await saveConversationMessages(supabase, conversation.id, context.userText, result.message);
    }
    return result;
  }

  if (gateDecision.mode === 'deterministic') {
    const result = fallback || {
      message: SMARTMARKET_AI_DISABLED_MESSAGE,
      usedFallback: true,
      toolCalls: [],
      model: null,
      period: null,
    };
    result.aiTelemetry = buildAiTelemetry({
      startedAt,
      fallbackUsed: true,
      gateDecision,
    });
    if (conversation) {
      await saveConversationMessages(supabase, conversation.id, context.userText, result.message);
    }
    return result;
  }

  try {
    const providerSelection = getAssistantLlmProvider();
    if (!providerSelection.ok) {
      throw new Error(providerSelection.reason);
    }

    const marketName = await getMarketDisplayName(supabase, context.clienteId, context.marketName);
    const aiContext = await buildAssistantAiContext({
      assistantContext: context,
      supabase,
      recentMessages,
      gateDecision,
      marketName,
    });
    const prompt = buildAssistantPrompt({ context: aiContext, gateDecision });
    const costEstimate = estimateAssistantCost({
      model: providerSelection.model,
      systemInstructions: prompt.systemInstructions,
      prompt: prompt.userPrompt,
      context: aiContext,
      maxOutputTokens: MAX_AI_OUTPUT_TOKENS,
    });
    const costLimit = validateAssistantCostLimits(costEstimate);
    if (!costLimit.ok) {
      throw new Error(costLimit.reason);
    }

    const providerResponse = await providerSelection.provider.generate({
      systemInstructions: prompt.systemInstructions,
      userPrompt: prompt.userPrompt,
      context: aiContext,
      conversation: recentMessages,
      metadata: {
        purpose: prompt.purpose,
        model: providerSelection.model,
        maxOutputTokens: MAX_AI_OUTPUT_TOKENS,
        timeoutMs: getAiTimeoutMs(),
      },
    });
    const validation = validateAssistantResponse({
      text: providerResponse.text,
      context: aiContext,
      maxLength: 3500,
    });

    if (!validation.valid) {
      throw new Error(`response_validation_failed:${validation.reasons.join(',')}`);
    }

    const answer = limitAssistantAnswer(validation.sanitizedText || SAFE_FAILURE_MESSAGE);
    if (conversation) {
      await saveConversationMessages(supabase, conversation.id, context.userText, answer);
    }

    console.info('[SmartMarket Assistant]', {
      status: 'completed',
      duration_ms: Date.now() - startedAt,
      provider: providerSelection.name,
      model: providerSelection.model,
      gate: gateDecision.reason,
    });

    return {
      message: answer,
      usedFallback: false,
      toolCalls: [],
      model: providerResponse.model,
      usage: providerResponse.usage,
      period: fallback?.period || null,
      aiTelemetry: buildAiTelemetry({
        startedAt,
        fallbackUsed: false,
        provider: providerSelection.name,
        model: providerSelection.model,
        gateDecision,
        estimatedTokens: {
          inputTokens: costEstimate.estimatedInputTokens,
          outputTokens: costEstimate.estimatedOutputTokens,
          totalTokens: costEstimate.estimatedTotalTokens,
        },
        estimatedCost: costEstimate,
        actualUsage: providerResponse.usage,
        validationPassed: true,
      }),
    };
  } catch (error) {
    const code = sanitizeOpenAIError(error);
    console.warn('[SmartMarket Assistant]', {
      status: 'failed',
      duration_ms: Date.now() - startedAt,
      error_code: code,
      gate: gateDecision.reason,
    });

    if (fallback) {
      fallback.aiTelemetry = buildAiTelemetry({
        startedAt,
        fallbackUsed: true,
        gateDecision,
        validationPassed: false,
        failureReason: error instanceof Error ? error.message.slice(0, 80) : code,
      });
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
      aiTelemetry: buildAiTelemetry({
        startedAt,
        fallbackUsed: true,
        gateDecision,
        validationPassed: false,
        failureReason: error instanceof Error ? error.message.slice(0, 80) : code,
      }),
    };
  }
}
