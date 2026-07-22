import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateProductRecommendations,
  summarizeProductRecommendations,
  type ProductRecommendation,
} from '@/lib/analytics/productRecommendations';
import { getProductMetricsForClient } from '@/lib/analytics/productAnalyticsService';
import type { AssistantContext, AssistantMessage, AssistantPeriod } from '../assistantTypes';
import { consultarProduto, listarPeriodos } from '../assistantTools';
import { extractLastProductContext } from '../router/intentExtractor';
import { normalizeIntentText } from '../router/intentNormalizer';
import type { AiGateDecision } from './assistantAiGate';

const MAX_CONTEXT_MESSAGES = 10;
const MAX_CONTEXT_MESSAGE_LENGTH = 600;
const DEFAULT_CONTEXT_RECOMMENDATIONS = 8;
const DEFAULT_CONTEXT_PRODUCTS = 3;

export type AssistantAiProductContext = {
  nome: string | null;
  categoria: string | null;
  severidade: string;
  recomendacao_principal: string;
  diagnostico: string;
  impacto: string;
  acao_recomendada: string;
  estoque_atual?: number | null;
  quantidade_vendida?: number | null;
  venda_media_dia?: number | null;
  cobertura_dias?: number | null;
  capital_estoque?: number | null;
  dias_sem_venda?: number | null;
  dias_ate_vencimento?: number | null;
  preco_venda?: number | null;
  preco_custo?: number | null;
};

export type AssistantAiRecommendationContext = AssistantAiProductContext & {
  prioridade_score: number;
};

export type AssistantAiSummaryContext = {
  total: number;
  criticas: number;
  altas: number;
  medias: number;
  baixas: number;
  informativas: number;
  capital_em_risco: number;
};

export type AssistantAiContext = {
  question: string;
  market: {
    name: string;
  };
  period: {
    start: string;
    end: string;
    label: string;
  };
  conversation: {
    recentMessages: readonly {
      role: 'user' | 'assistant';
      content: string;
    }[];
    activeProduct?: string;
    activeCategory?: string;
    previousPeriod?: string;
  };
  analytics: {
    summary?: AssistantAiSummaryContext;
    products: readonly AssistantAiProductContext[];
    recommendations: readonly AssistantAiRecommendationContext[];
    promotionSimulations: readonly {
      produto: string | null;
      desconto_percentual: number;
      preco_promocional: number;
      ganho_economico_incremental: number;
    }[];
    comparison?: {
      currentPeriod?: string;
      previousPeriod?: string;
      product?: string;
    };
  };
  constraints: {
    readOnly: true;
    allowSql: false;
    allowHttp: false;
    allowWrites: false;
  };
};

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeAiString(value: string | null | undefined) {
  if (!value) return value ?? null;
  return value
    .replace(/\bcliente_id\b/gi, '[campo interno]')
    .replace(/\bmarketId\b/gi, '[campo interno]')
    .replace(/\bchat_id\b/gi, '[campo interno]')
    .replace(/\b(token|senha|chave|service role)\b/gi, '[dado sensivel]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id interno]');
}

function sanitizeMessage(message: AssistantMessage) {
  return {
    role: message.role,
    content: (sanitizeAiString(message.content) || '').slice(0, MAX_CONTEXT_MESSAGE_LENGTH),
  };
}

function periodLabel(period: AssistantPeriod | null) {
  if (!period) return 'Periodo nao encontrado';
  return `${period.periodo_inicio} a ${period.periodo_fim}`;
}

function metricValue(recommendation: ProductRecommendation, key: string) {
  return asNumber((recommendation.metricas_relevantes as Record<string, unknown>)[key]);
}

function sanitizeProduct(recommendation: ProductRecommendation): AssistantAiProductContext {
  return {
    nome: sanitizeAiString(recommendation.nome),
    categoria: sanitizeAiString(recommendation.categoria),
    severidade: recommendation.severidade,
    recomendacao_principal: recommendation.recomendacao_principal,
    diagnostico: sanitizeAiString(recommendation.diagnostico) || '',
    impacto: sanitizeAiString(recommendation.impacto) || '',
    acao_recomendada: recommendation.acao_recomendada,
    estoque_atual: metricValue(recommendation, 'estoque_atual'),
    quantidade_vendida: metricValue(recommendation, 'quantidade_vendida'),
    venda_media_dia: metricValue(recommendation, 'venda_media_dia'),
    cobertura_dias: metricValue(recommendation, 'cobertura_dias'),
    capital_estoque: metricValue(recommendation, 'capital_estoque'),
    dias_sem_venda: metricValue(recommendation, 'dias_sem_venda'),
    dias_ate_vencimento: metricValue(recommendation, 'dias_ate_vencimento'),
    preco_venda: metricValue(recommendation, 'preco_venda'),
    preco_custo: metricValue(recommendation, 'preco_custo'),
  };
}

function sanitizeRecommendation(recommendation: ProductRecommendation): AssistantAiRecommendationContext {
  return {
    ...sanitizeProduct(recommendation),
    prioridade_score: recommendation.prioridade_score,
  };
}

function promotionSimulation(recommendation: ProductRecommendation) {
  const scenario = recommendation.simulacao_promocao?.melhor_cenario;
  if (!scenario) return null;
  return {
    produto: recommendation.nome,
    desconto_percentual: scenario.desconto_percentual,
    preco_promocional: scenario.preco_promocional,
    ganho_economico_incremental: scenario.ganho_economico_incremental,
  };
}

function inferProductTermFromQuestion(question: string, recommendations: ProductRecommendation[]) {
  const normalizedQuestion = normalizeIntentText(question).normalized;
  for (const recommendation of recommendations) {
    const normalizedName = normalizeIntentText(recommendation.nome || '').normalized;
    const firstWord = normalizedName.split(/\s+/).find((word) => word.length >= 4);
    if (firstWord && normalizedQuestion.includes(firstWord)) {
      return firstWord;
    }
  }
  return undefined;
}

function contextLimitsForPurpose(gateDecision: AiGateDecision) {
  if (
    gateDecision.purpose === 'explanation' ||
    gateDecision.purpose === 'promotion_advice' ||
    gateDecision.purpose === 'inventory_advice'
  ) {
    return {
      recommendations: 3,
      products: 1,
      includeInferredProduct: true,
    };
  }

  if (gateDecision.purpose === 'executive_summary') {
    return {
      recommendations: 6,
      products: 0,
      includeInferredProduct: false,
    };
  }

  return {
    recommendations: DEFAULT_CONTEXT_RECOMMENDATIONS,
    products: DEFAULT_CONTEXT_PRODUCTS,
    includeInferredProduct: false,
  };
}

export async function buildAssistantAiContext(input: {
  assistantContext: AssistantContext;
  supabase: SupabaseClient;
  recentMessages: AssistantMessage[];
  gateDecision: AiGateDecision;
  marketName: string;
}): Promise<AssistantAiContext> {
  const periods = await listarPeriodos({ clienteId: input.assistantContext.clienteId, supabase: input.supabase });
  const latest = periods.periodo_mais_recente;
  const route = input.gateDecision.route;
  const limits = contextLimitsForPurpose(input.gateDecision);
  let productTerm = limits.includeInferredProduct
    ? route?.entities.productTerm || extractLastProductContext(input.recentMessages)?.productTerm
    : route?.entities.productTerm;
  const category = route?.entities.category;

  const metrics = await getProductMetricsForClient(input.supabase, input.assistantContext.clienteId, {
    periodoInicio: latest?.periodo_inicio || null,
    periodoFim: latest?.periodo_fim || null,
    produtoId: null,
    categoria: category || null,
    limite: 500,
  });
  const recommendations = generateProductRecommendations(metrics);
  productTerm = productTerm || (limits.includeInferredProduct
    ? inferProductTermFromQuestion(input.assistantContext.userText, recommendations)
    : undefined);
  const summary = summarizeProductRecommendations(recommendations);
  const selectedRecommendations = recommendations.slice(0, limits.recommendations);
  const products: AssistantAiProductContext[] = [];

  if (productTerm) {
    const lookup = await consultarProduto(
      { clienteId: input.assistantContext.clienteId, supabase: input.supabase },
      {
        produto: productTerm,
        periodo_inicio: latest?.periodo_inicio,
        periodo_fim: latest?.periodo_fim,
      }
    );
    if (lookup.status === 'found') {
      products.push(sanitizeProduct(lookup.produto));
    }
  }

  for (const recommendation of selectedRecommendations) {
    if (products.length >= limits.products) break;
    if (!products.some((product) => product.nome === recommendation.nome)) {
      products.push(sanitizeProduct(recommendation));
    }
  }

  return {
    question: (sanitizeAiString(input.assistantContext.userText) || '').slice(0, MAX_CONTEXT_MESSAGE_LENGTH),
    market: {
      name: sanitizeAiString(input.marketName) || 'SmartMarket',
    },
    period: {
      start: latest?.periodo_inicio || '',
      end: latest?.periodo_fim || '',
      label: periodLabel(latest),
    },
    conversation: {
      recentMessages: input.recentMessages.slice(-MAX_CONTEXT_MESSAGES).map(sanitizeMessage),
      activeProduct: sanitizeAiString(productTerm) || undefined,
      activeCategory: sanitizeAiString(category) || undefined,
      previousPeriod: periods.periodos[1] ? periodLabel(periods.periodos[1]) : undefined,
    },
    analytics: {
      summary: {
        total: recommendations.length,
        criticas: summary.criticas,
        altas: summary.altas,
        medias: summary.medias,
        baixas: summary.baixas,
        informativas: summary.informativas,
        capital_em_risco: summary.capital_em_risco,
      },
      products,
      recommendations: selectedRecommendations.map(sanitizeRecommendation),
      promotionSimulations: selectedRecommendations
        .map(promotionSimulation)
        .filter((item): item is NonNullable<typeof item> => item !== null),
    },
    constraints: {
      readOnly: true,
      allowSql: false,
      allowHttp: false,
      allowWrites: false,
    },
  };
}
