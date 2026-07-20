import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProductRecommendation,
  RecommendationSeverity,
  RecommendationType,
} from '@/lib/analytics/productRecommendations';

export type AssistantToolName =
  | 'listar_periodos'
  | 'consultar_resumo_decisoes'
  | 'consultar_recomendacoes'
  | 'consultar_produto'
  | 'comparar_produto_periodos';

export type AssistantRole = 'user' | 'assistant';

export type AssistantMessage = {
  role: AssistantRole;
  content: string;
};

export type AssistantPeriod = {
  periodo_inicio: string;
  periodo_fim: string;
};

export type AssistantContext = {
  clienteId: string;
  chatId: string;
  userText: string;
  marketName?: string;
  recentMessages?: AssistantMessage[];
  supabase?: SupabaseClient;
};

export type AssistantToolContext = {
  clienteId: string;
  supabase: SupabaseClient;
};

export type AssistantToolCallLog = {
  name: AssistantToolName;
  durationMs: number;
  success: boolean;
  errorCode?: string;
};

export type AssistantRunResult = {
  message: string;
  usedFallback: boolean;
  toolCalls: AssistantToolCallLog[];
  model: string | null;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  period?: AssistantPeriod | null;
};

export type RecommendationFilters = {
  periodo_inicio?: string;
  periodo_fim?: string;
  severidade?: RecommendationSeverity;
  recomendacao?: RecommendationType;
  categoria?: string;
  limite?: number;
};

export type ProductLookupResult =
  | {
      status: 'found';
      produto: ProductRecommendation;
      periodo: AssistantPeriod | null;
    }
  | {
      status: 'multiple_matches';
      matches: Array<{ produto_id: string; nome: string | null; categoria: string | null }>;
      message: string;
    }
  | {
      status: 'not_found';
      message: string;
    };

export type AssistantConnection = {
  cliente_id: string;
  chat_id: string;
  telegram_username: string | null;
  telegram_first_name: string | null;
  ativo: boolean;
};
