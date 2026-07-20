import { z } from 'zod';
import type { AssistantToolName } from './assistantTypes';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const productNameSchema = z.string().trim().min(1).max(120);

const severitySchema = z.enum(['critica', 'alta', 'media', 'baixa', 'informativa']);
const recommendationSchema = z.enum([
  'RISCO_RUPTURA',
  'REPOSICAO_PRIORITARIA',
  'SEM_VENDAS',
  'EXCESSO_ESTOQUE',
  'CAPITAL_PARADO',
  'RISCO_VENCIMENTO',
  'PRODUTO_VENCIDO',
  'QUEDA_VENDAS',
  'CRESCIMENTO_VENDAS',
  'MARGEM_BAIXA',
  'MONITORAR',
]);

export const listarPeriodosSchema = z.object({}).strict();

export const consultarResumoDecisoesSchema = z.object({
  periodo_inicio: dateSchema.optional(),
  periodo_fim: dateSchema.optional(),
}).strict();

export const consultarRecomendacoesSchema = z.object({
  periodo_inicio: dateSchema.optional(),
  periodo_fim: dateSchema.optional(),
  severidade: severitySchema.optional(),
  recomendacao: recommendationSchema.optional(),
  categoria: z.string().trim().min(1).max(80).optional(),
  limite: z.number().int().min(1).max(20).optional(),
}).strict();

export const consultarProdutoSchema = z.object({
  produto: productNameSchema,
  periodo_inicio: dateSchema.optional(),
  periodo_fim: dateSchema.optional(),
}).strict();

export const compararProdutoPeriodosSchema = z.object({
  produto: productNameSchema,
  periodo_atual_inicio: dateSchema.optional(),
  periodo_atual_fim: dateSchema.optional(),
  periodo_anterior_inicio: dateSchema.optional(),
  periodo_anterior_fim: dateSchema.optional(),
}).strict();

export const assistantToolArgumentSchemas = {
  listar_periodos: listarPeriodosSchema,
  consultar_resumo_decisoes: consultarResumoDecisoesSchema,
  consultar_recomendacoes: consultarRecomendacoesSchema,
  consultar_produto: consultarProdutoSchema,
  comparar_produto_periodos: compararProdutoPeriodosSchema,
} satisfies Record<AssistantToolName, z.ZodType>;

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

function objectSchema(properties: Record<string, unknown>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const dateProperty = {
  type: ['string', 'null'],
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Data no formato YYYY-MM-DD.',
};

export const assistantOpenAITools = [
  {
    type: 'function',
    name: 'listar_periodos',
    description: 'Lista os periodos de importacao disponiveis para o cliente ja autorizado.',
    strict: true,
    parameters: objectSchema({}),
  },
  {
    type: 'function',
    name: 'consultar_resumo_decisoes',
    description: 'Consulta o resumo deterministico de decisoes de um periodo.',
    strict: true,
    parameters: objectSchema({
      periodo_inicio: dateProperty,
      periodo_fim: dateProperty,
    }),
  },
  {
    type: 'function',
    name: 'consultar_recomendacoes',
    description: 'Consulta recomendacoes operacionais deterministicas com filtros opcionais.',
    strict: true,
    parameters: objectSchema({
      periodo_inicio: dateProperty,
      periodo_fim: dateProperty,
      severidade: { type: ['string', 'null'], enum: ['critica', 'alta', 'media', 'baixa', 'informativa', null] },
      recomendacao: {
        type: ['string', 'null'],
        enum: [
          'RISCO_RUPTURA',
          'REPOSICAO_PRIORITARIA',
          'SEM_VENDAS',
          'EXCESSO_ESTOQUE',
          'CAPITAL_PARADO',
          'RISCO_VENCIMENTO',
          'PRODUTO_VENCIDO',
          'QUEDA_VENDAS',
          'CRESCIMENTO_VENDAS',
          'MARGEM_BAIXA',
          'MONITORAR',
          null,
        ],
      },
      categoria: { type: ['string', 'null'], maxLength: 80 },
      limite: { type: ['integer', 'null'], minimum: 1, maximum: 20 },
    }),
  },
  {
    type: 'function',
    name: 'consultar_produto',
    description: 'Consulta metricas e recomendacao deterministica de um produto por nome parcial.',
    strict: true,
    parameters: objectSchema({
      produto: { type: 'string', minLength: 1, maxLength: 120 },
      periodo_inicio: dateProperty,
      periodo_fim: dateProperty,
    }),
  },
  {
    type: 'function',
    name: 'comparar_produto_periodos',
    description: 'Compara o mesmo produto entre dois periodos usando metricas existentes.',
    strict: true,
    parameters: objectSchema({
      produto: { type: 'string', minLength: 1, maxLength: 120 },
      periodo_atual_inicio: dateProperty,
      periodo_atual_fim: dateProperty,
      periodo_anterior_inicio: dateProperty,
      periodo_anterior_fim: dateProperty,
    }),
  },
] as const;
