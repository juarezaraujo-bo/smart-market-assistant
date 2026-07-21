import type { AssistantMessage } from '../assistantTypes';
import type { LastProductContext, PeriodReference, SalesRankingDirection } from './assistantIntents';
import { CATEGORY_PATTERNS, KNOWN_CATEGORY_TERMS, PRODUCT_PATTERNS } from './intentPatterns';
import { cleanIntentTerm, normalizeIntentText } from './intentNormalizer';

export function extractLimit(text: string) {
  const match = normalizeIntentText(text).normalized.match(/\btop\s+(\d{1,2})\b/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed)) return undefined;
  return Math.min(Math.max(parsed, 1), 10);
}

export function extractPeriodReference(text: string): PeriodReference | undefined {
  const normalized = normalizeIntentText(text).normalized;
  if (normalized.includes('trimestre anterior')) return 'previous_quarter';
  if (normalized.includes('mes anterior') || normalized.includes('mes passado')) return 'previous_month';
  if (normalized.includes('antes disso')) return 'before_that';
  return undefined;
}

export function extractSalesDirection(text: string): SalesRankingDirection | undefined {
  const normalized = normalizeIntentText(text).normalized;
  if (['vende menos', 'menos vendido', 'menos vendidos'].some((term) => normalized.includes(term))) return 'least';
  if (['vende mais', 'mais vendido', 'mais vendidos'].some((term) => normalized.includes(term))) return 'most';
  return undefined;
}

export function extractCategory(text: string) {
  const normalized = normalizeIntentText(text).normalized;

  for (const pattern of CATEGORY_PATTERNS) {
    const match = normalized.match(pattern);
    const term = cleanIntentTerm(match?.[1] || '');
    if (term) return term;
  }

  return KNOWN_CATEGORY_TERMS.find((term) => normalized.includes(term));
}

function removePeriodTail(value: string) {
  return value
    .replace(/\b(no|na|em)?\s*(mes anterior|mes passado|trimestre anterior|antes disso)\b/g, '')
    .trim();
}

export function extractProductTerm(text: string) {
  const normalized = normalizeIntentText(text).normalized;

  for (const pattern of PRODUCT_PATTERNS) {
    const match = normalized.match(pattern);
    const term = cleanIntentTerm(removePeriodTail(match?.[1] || ''));
    if (term && !KNOWN_CATEGORY_TERMS.includes(term)) return term;
  }

  return undefined;
}

export function extractLastProductContext(messages: AssistantMessage[]): LastProductContext | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant') continue;
    const productMatch = message.content.match(/\n([^\n]+)\nCategoria:/);
    if (!productMatch?.[1]) continue;
    const productTerm = cleanIntentTerm(productMatch[1]);
    if (productTerm) return { productTerm };
  }

  return null;
}
