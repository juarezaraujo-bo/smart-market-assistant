import type { AssistantAiContext } from './assistantContextBuilder';

export type AssistantResponseValidationResult =
  | { valid: true; sanitizedText: string; reasons: readonly string[] }
  | { valid: false; sanitizedText: string; reasons: readonly string[] };

const MAX_RESPONSE_LENGTH = 3500;

const BLOCKED_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'internal_client_id', pattern: /\bcliente_id\b/i },
  { code: 'internal_uuid', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  { code: 'sql', pattern: /\b(sql|select|insert|update|delete|drop|alter|create)\b/i },
  { code: 'internal_table', pattern: /\b(produto_periodos|uploads_history|assistant_messages|assistant_conversations|telegram_connections)\b/i },
  { code: 'secret', pattern: /\b(api[_-]?key|service[_-]?role|authorization|bearer|token|senha|chave)\b/i },
  { code: 'internal_instruction', pattern: /\binstrucoes internas|instruções internas|system prompt|prompt interno\b/i },
  { code: 'unauthorized_url', pattern: /https?:\/\//i },
  { code: 'write_claim', pattern: /\b(alterei|atualizei|exclui|apaguei|cadastrei|modifiquei)\b/i },
  { code: 'invalid_number', pattern: /\b(NaN|Infinity|-Infinity|undefined|null)\b/i },
  { code: 'markdown_code_block', pattern: /```/ },
];

function normalizeText(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

function collectContextNumberTokens(context: AssistantAiContext) {
  const serialized = JSON.stringify(context);
  const matches = serialized.match(/-?\d+(?:[.,]\d+)?/g) || [];
  return new Set(matches.map(normalizeNumberToken));
}

function extractMentionedNumbers(text: string) {
  return (text.match(/R\$\s*\d+(?:[.,]\d+)?/g) || [])
    .map((value) => value.replace('R$', '').trim())
    .map(normalizeNumberToken);
}

function normalizeNumberToken(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? String(parsed) : value.replace(',', '.');
}

function hasUnsupportedNumbers(text: string, context: AssistantAiContext) {
  const allowed = collectContextNumberTokens(context);
  const mentioned = extractMentionedNumbers(text);
  return mentioned.some((value) => !allowed.has(value));
}

export function validateAssistantResponse(input: {
  text: string;
  context: AssistantAiContext;
  maxLength?: number;
}): AssistantResponseValidationResult {
  const sanitizedText = normalizeText(input.text);
  const reasons: string[] = [];

  if (!sanitizedText) reasons.push('empty_response');
  if (sanitizedText.length > (input.maxLength || MAX_RESPONSE_LENGTH)) reasons.push('response_too_long');

  for (const blocked of BLOCKED_PATTERNS) {
    if (blocked.pattern.test(sanitizedText)) reasons.push(blocked.code);
  }

  if (hasUnsupportedNumbers(sanitizedText, input.context)) {
    reasons.push('number_not_found_in_context');
  }

  return reasons.length > 0
    ? { valid: false, sanitizedText, reasons }
    : { valid: true, sanitizedText, reasons };
}
