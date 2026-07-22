import type { AssistantAiContext } from '../ai/assistantContextBuilder';
import type { AiGateDecision } from '../ai/assistantAiGate';
import {
  ASSISTANT_RESPONSE_OBJECTIVES,
  type AssistantContextRequirement,
  type AssistantResponseObjective,
  type AssistantResponseObjectiveDefinition,
} from './assistantResponseObjectives';
import { buildCommunicationPrinciplesText } from './assistantCommunicationPrinciples';

export type AssistantBehaviorContextValidation =
  | { ok: true; missing: readonly AssistantContextRequirement[] }
  | { ok: false; missing: readonly AssistantContextRequirement[]; fallbackMessage: string };

export type AssistantBehavior = {
  objective: AssistantResponseObjective;
  definition: AssistantResponseObjectiveDefinition;
  communicationPrinciplesText: string;
};

export function resolveAssistantResponseObjective(gateDecision: AiGateDecision): AssistantResponseObjective {
  if (gateDecision.purpose === 'explanation') return 'explanation';
  if (gateDecision.purpose === 'strategy') return 'strategy';
  if (gateDecision.purpose === 'executive_summary') return 'executive_summary';
  if (gateDecision.purpose === 'action_plan') return 'action_plan';
  if (gateDecision.purpose === 'promotion_advice') return 'promotion_advice';
  if (gateDecision.purpose === 'inventory_advice') return 'inventory_advice';
  return 'explanation';
}

export function getAssistantBehavior(objective: AssistantResponseObjective): AssistantBehavior {
  const definition = ASSISTANT_RESPONSE_OBJECTIVES[objective];
  if (!definition) {
    throw new Error('assistant_behavior_objective_unknown');
  }

  return {
    objective,
    definition,
    communicationPrinciplesText: buildCommunicationPrinciplesText(),
  };
}

function hasInventoryMetrics(context: AssistantAiContext) {
  return context.analytics.products.some((product) =>
    product.estoque_atual !== null &&
    product.estoque_atual !== undefined &&
    product.quantidade_vendida !== null &&
    product.quantidade_vendida !== undefined
  );
}

function hasPromotionSimulation(context: AssistantAiContext) {
  return context.analytics.promotionSimulations.length > 0 ||
    context.analytics.recommendations.some((item) => item.acao_recomendada === 'CRIAR_PROMOCAO');
}

function hasRequirement(context: AssistantAiContext, requirement: AssistantContextRequirement) {
  if (requirement === 'summary') return Boolean(context.analytics.summary);
  if (requirement === 'product') return context.analytics.products.length > 0 || context.analytics.recommendations.length > 0;
  if (requirement === 'recommendations') return context.analytics.recommendations.length > 0;
  if (requirement === 'promotion_simulation') return hasPromotionSimulation(context);
  if (requirement === 'inventory_metrics') return hasInventoryMetrics(context);
  return false;
}

export function validateAssistantBehaviorContext(
  behavior: AssistantBehavior,
  context: AssistantAiContext
): AssistantBehaviorContextValidation {
  const missing = behavior.definition.minimumData.filter((requirement) => !hasRequirement(context, requirement));

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      fallbackMessage: behavior.definition.missingDataFallback,
    };
  }

  return {
    ok: true,
    missing,
  };
}

export function buildBehaviorInstructions(behavior: AssistantBehavior) {
  return [
    `Objetivo da resposta: ${behavior.definition.purpose}`,
    '',
    'Principios de comunicacao:',
    behavior.communicationPrinciplesText,
    '',
    'Instrucoes especificas do objetivo:',
    behavior.definition.instructions.map((item) => `- ${item}`).join('\n'),
    '',
    'Estrutura esperada:',
    behavior.definition.expectedStructure.map((item) => `- ${item}`).join('\n'),
    '',
    'Linguagem recomendada:',
    behavior.definition.recommendedLanguage.map((item) => `- ${item}`).join('\n'),
    '',
    'Linguagem proibida:',
    behavior.definition.forbiddenLanguage.map((item) => `- ${item}`).join('\n'),
    '',
    'Regras de cautela:',
    behavior.definition.cautionRules.map((item) => `- ${item}`).join('\n'),
    '',
    `Tamanho maximo sugerido: ${behavior.definition.suggestedMaxChars} caracteres.`,
  ].join('\n');
}
