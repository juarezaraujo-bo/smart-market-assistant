import type { AssistantAiContext } from '../ai/assistantContextBuilder';
import type { AssistantMessage } from '../assistantTypes';

export type AssistantToolDefinition = {
  readonly type: 'function';
  readonly name: string;
  readonly description?: string;
  readonly strict?: boolean;
  readonly parameters: unknown;
};

export type AssistantToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type AssistantAiRequestMetadata = {
  purpose: 'explanation' | 'strategy' | 'executive_summary' | 'promotion_advice' | 'inventory_advice';
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
};

export type LlmRequest = {
  systemInstructions: string;
  userPrompt: string;
  context: AssistantAiContext;
  tools?: readonly AssistantToolDefinition[];
  conversation?: readonly AssistantMessage[];
  metadata?: AssistantAiRequestMetadata;
};

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LlmResponse = {
  text: string;
  model: string;
  usage?: LlmUsage;
  toolCalls?: readonly AssistantToolCall[];
  finishReason?: string;
};

export interface LlmProvider {
  readonly name: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
}
