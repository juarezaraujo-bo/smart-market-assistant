import type { Response, Tool } from 'openai/resources/responses/responses';
import {
  createOpenAIClient,
  getAssistantModel,
} from '../openaiClient';
import type { LlmProvider, LlmRequest, LlmResponse } from './llmProvider';

function extractUsage(response: Response) {
  const usage = response.usage;
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai';

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const client = createOpenAIClient();
    const model = request.metadata?.model || getAssistantModel();
    const conversation = request.conversation || [];
    const input = [
      ...conversation.map((message) => ({
        type: 'message' as const,
        role: message.role,
        content: message.content,
      })),
      {
        type: 'message' as const,
        role: 'user' as const,
        content: request.userPrompt,
      },
    ];

    const response = await client.responses.create({
      model,
      instructions: request.systemInstructions,
      input,
      tools: request.tools as Tool[] | undefined,
      store: false,
      max_output_tokens: request.metadata?.maxOutputTokens ?? 900,
    });

    return {
      text: response.output_text || '',
      model,
      usage: extractUsage(response),
      finishReason: response.status || undefined,
    };
  }
}
