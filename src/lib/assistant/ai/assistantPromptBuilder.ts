import { SMARTMARKET_ASSISTANT_INSTRUCTIONS } from '../assistantInstructions';
import type { AssistantAiContext } from './assistantContextBuilder';
import type { AiGateDecision } from './assistantAiGate';

export type AssistantPromptPurpose =
  | 'explanation'
  | 'strategy'
  | 'executive_summary'
  | 'promotion_advice'
  | 'inventory_advice';

export type AssistantPrompt = {
  systemInstructions: string;
  userPrompt: string;
  purpose: AssistantPromptPurpose;
};

const PRESENTATION_RULES = [
  'Use linguagem simples para dono de pequeno mercado.',
  'Responda de forma curta para Telegram.',
  'Nao mostre custo, tokens, IDs internos ou detalhes de implementacao.',
  'Use termos como estimado, potencial, simulacao ou projecao quando falar de efeito futuro.',
].join('\n');

const DATA_RULES = [
  'Use somente o contexto estruturado abaixo.',
  'Nao invente numeros, produtos, periodos, scores ou recomendacoes.',
  'Nao altere numeros recebidos do contexto.',
  'Nao assuma dados ausentes.',
  'Se faltar dado, diga que falta dado.',
  'Nao prometa resultado; diferencie projecao de resultado real.',
].join('\n');

function purposeFromGate(gateDecision: AiGateDecision): AssistantPromptPurpose {
  return gateDecision.purpose || 'explanation';
}

function sanitizeContextForPrompt(context: AssistantAiContext) {
  return JSON.stringify(context, null, 2);
}

function sanitizeInstructionsForModel(value: string) {
  return value
    .replace(/\bcliente_id\b/gi, 'identificador interno')
    .replace(/\bservice role\b/gi, 'credencial interna');
}

export function buildAssistantPrompt(input: {
  context: AssistantAiContext;
  gateDecision: AiGateDecision;
}): AssistantPrompt {
  const purpose = purposeFromGate(input.gateDecision);
  const systemInstructions = [
    sanitizeInstructionsForModel(SMARTMARKET_ASSISTANT_INSTRUCTIONS.trim()),
    '',
    'Fundacao IA 4.1 - regras permanentes:',
    DATA_RULES,
    '',
    'Regras de apresentacao:',
    PRESENTATION_RULES,
  ].join('\n');

  const userPrompt = [
    `Finalidade: ${purpose}`,
    `Pergunta do usuario: ${input.context.question}`,
    '',
    'Contexto estruturado sanitizado:',
    sanitizeContextForPrompt(input.context),
    '',
    'Responda em portugues do Brasil, sem SQL, sem IDs internos e sem revelar detalhes privados.',
  ].join('\n');

  return {
    systemInstructions,
    userPrompt,
    purpose,
  };
}
