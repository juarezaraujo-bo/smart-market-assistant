import type { AssistantMessage } from '../assistantTypes';
import type { AssistantIntent, AssistantIntentRoute } from '../router/assistantIntents';
import { routeAssistantIntent } from '../router/intentRouter';
import { normalizeIntentText } from '../router/intentNormalizer';

export type AiGateMode = 'deterministic' | 'generative' | 'refuse';

export type AiGateDecision = {
  mode: AiGateMode;
  reason: string;
  confidence: number;
  intent?: AssistantIntent;
  route?: AssistantIntentRoute;
  purpose?: 'explanation' | 'strategy' | 'executive_summary' | 'promotion_advice' | 'inventory_advice';
};

const DETERMINISTIC_INTENTS = new Set<AssistantIntent>([
  'priorities',
  'product_analysis',
  'category_analysis',
  'idle_capital',
  'replenishment',
  'expiration',
  'stagnant_products',
  'promotions',
  'sales_ranking',
  'executive_summary',
  'period_comparison',
  'help',
  'unknown',
]);

function includesAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function isWriteOrUnsafeRequest(normalized: string) {
  return includesAny(normalized, [
    'alterar estoque',
    'altere o estoque',
    'altere estoque',
    'mudar estoque',
    'zerar estoque',
    'cadastre ',
    'cadastrar ',
    'excluir ',
    'deletar ',
    'apagar ',
    'atualizar banco',
    'update ',
    'delete ',
    'insert ',
    'drop ',
    'sql',
    'cliente_id',
    'service role',
    'ignore as regras',
    'ignore suas regras',
    'ignorar regras',
    'mostre ids',
    'mostrar ids',
  ]);
}

function getGenerativePurpose(normalized: string): AiGateDecision['purpose'] | null {
  if (includesAny(normalized, ['explique', 'explica', 'por que', 'porque'])) return 'explanation';
  if (includesAny(normalized, ['estrategia', 'estratégia', 'plano de acao', 'plano de ação', 'o que voce faria', 'o que você faria'])) return 'strategy';
  if (includesAny(normalized, ['resuma em linguagem simples', 'resuma os principais riscos', 'resuma os riscos', 'linguagem simples', 'explique os resultados', 'sem conhecimento tecnico', 'sem conhecimento técnico'])) return 'executive_summary';
  if (includesAny(normalized, ['promocao', 'promoção', 'desconto'])) return 'promotion_advice';
  if (includesAny(normalized, ['reduzir perdas', 'evitar perdas', 'estoque'])) return 'inventory_advice';
  return null;
}

export function decideAssistantAiMode(text: string, recentMessages: AssistantMessage[] = []): AiGateDecision {
  const normalized = normalizeIntentText(text).normalized;
  const route = routeAssistantIntent(text, recentMessages);

  if (isWriteOrUnsafeRequest(normalized)) {
    return {
      mode: 'refuse',
      reason: 'unsafe_or_write_request',
      confidence: 0.98,
      intent: route.intent,
      route,
    };
  }

  const purpose = getGenerativePurpose(normalized);
  if (purpose) {
    return {
      mode: 'generative',
      reason: `generative_${purpose}`,
      confidence: 0.82,
      intent: route.intent,
      route,
      purpose,
    };
  }

  if (DETERMINISTIC_INTENTS.has(route.intent)) {
    return {
      mode: 'deterministic',
      reason: `deterministic_${route.intent}`,
      confidence: route.confidence,
      intent: route.intent,
      route,
    };
  }

  return {
    mode: 'deterministic',
    reason: 'deterministic_default',
    confidence: 0.5,
    intent: route.intent,
    route,
  };
}
