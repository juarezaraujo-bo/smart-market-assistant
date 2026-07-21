import type { AssistantMessage } from '../assistantTypes';
import type { AssistantIntent, AssistantIntentRoute } from './assistantIntents';
import {
  extractCategory,
  extractLastProductContext,
  extractLimit,
  extractPeriodReference,
  extractProductTerm,
  extractSalesDirection,
} from './intentExtractor';
import { INTENT_KEYWORDS } from './intentPatterns';
import { normalizeIntentText } from './intentNormalizer';

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function route(intent: AssistantIntent, reason: string, input: Partial<AssistantIntentRoute> = {}): AssistantIntentRoute {
  return {
    intent,
    confidence: input.confidence ?? 0.85,
    entities: input.entities ?? {},
    reason,
  };
}

function isUnsafeRequest(normalized: string) {
  return [
    'trocar de mercado',
    'outro mercado',
    'cliente_id',
    'marketid',
    'sql',
    'select ',
    'delete ',
    'update ',
    'alterar estoque',
    'mudar estoque',
    'ignore as regras',
    'ignorar regras',
  ].some((term) => normalized.includes(term));
}

export function routeAssistantIntent(text: string, recentMessages: AssistantMessage[] = []): AssistantIntentRoute {
  const normalized = normalizeIntentText(text).normalized;
  const limit = extractLimit(text);
  const periodReference = extractPeriodReference(text);
  const salesDirection = extractSalesDirection(text);
  const category = extractCategory(text);
  const productTerm = extractProductTerm(text);

  if (isUnsafeRequest(normalized)) return route('help', 'unsafe_request_redirected_to_help', { confidence: 0.7 });
  if (includesAny(normalized, INTENT_KEYWORDS.help)) return route('help', 'help_keyword', { confidence: 0.95 });

  if (periodReference) {
    const context = extractLastProductContext(recentMessages);
    return route('period_comparison', 'period_reference', {
      confidence: context || productTerm ? 0.9 : 0.65,
      entities: {
        productTerm: productTerm || context?.productTerm,
        periodReference,
      },
    });
  }

  if (includesAny(normalized, INTENT_KEYWORDS.promotions)) {
    return route('promotions', 'promotion_keyword', { entities: { category, limit } });
  }
  if (includesAny(normalized, INTENT_KEYWORDS.replenishment)) {
    return route('replenishment', 'replenishment_keyword', { entities: { category, limit } });
  }
  if (includesAny(normalized, INTENT_KEYWORDS.expiration)) {
    return route('expiration', 'expiration_keyword', { entities: { category, limit } });
  }
  if (includesAny(normalized, INTENT_KEYWORDS.stagnant_products)) {
    return route('stagnant_products', 'stagnant_keyword', { entities: { category, limit } });
  }
  if (includesAny(normalized, INTENT_KEYWORDS.sales_ranking)) {
    return route('sales_ranking', 'sales_ranking_keyword', {
      entities: { category, limit, salesDirection: salesDirection || 'most' },
    });
  }
  if (includesAny(normalized, INTENT_KEYWORDS.idle_capital)) {
    return route('idle_capital', 'capital_keyword', { entities: { category, limit } });
  }
  if (includesAny(normalized, INTENT_KEYWORDS.priorities)) {
    return route('priorities', 'priorities_keyword', { entities: { category, limit } });
  }
  if (includesAny(normalized, INTENT_KEYWORDS.executive_summary)) {
    return route('executive_summary', 'summary_keyword', { entities: { category } });
  }
  if (category) return route('category_analysis', 'category_detected', { entities: { category, limit } });
  if (productTerm) return route('product_analysis', 'product_pattern', { entities: { productTerm, limit } });

  return route('unknown', 'no_match', { confidence: 0 });
}
